import { useMemo, useRef, useState } from 'react';
import { CODE_EXT } from '../core/parser.js';

function buildTree(paths) {
  const root = { name: '', path: '', dirs: new Map(), files: [] };
  for (const p of paths) {
    const parts = p.split('/');
    let node = root;
    parts.slice(0, -1).forEach((part, i) => {
      if (!node.dirs.has(part)) {
        node.dirs.set(part, { name: part, path: parts.slice(0, i + 1).join('/'), dirs: new Map(), files: [] });
      }
      node = node.dirs.get(part);
    });
    node.files.push(p);
  }
  return root;
}

function Dir({ node, depth, ctx }) {
  const open = !ctx.collapsed.has(node.path);
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      {node.path && (
        <div className="tree-row dir" style={{ paddingLeft: 8 + depth * 12 }} onClick={() => ctx.toggle(node.path)}>
          <span className="chev">{open ? '▾' : '▸'}</span>
          <span className="folder-dot" style={{ background: ctx.folderColor(node.path) }} />
          {node.name}
          <button className="row-btn" title="New file here" onClick={(e) => { e.stopPropagation(); ctx.newIn(node.path + '/'); }}>+</button>
        </div>
      )}
      {open && (
        <>
          {dirs.map((d) => <Dir key={d.path} node={d} depth={node.path ? depth + 1 : depth} ctx={ctx} />)}
          {node.files.sort().map((f) => {
            const st = ctx.fileStatus(f);
            return (
              <div
                key={f}
                className={'tree-row file' + (ctx.selected === f ? ' active' : '')}
                style={{ paddingLeft: 8 + (node.path ? depth + 1 : depth) * 12 + 12 }}
                onClick={() => ctx.select(f)}
              >
                {st.cycleColor && <span className="cyc-dot" style={{ background: st.cycleColor }} title="Part of a circular dependency" />}
                <span className="fname">{f.split('/').pop()}</span>
                <button className="row-btn" title="Delete file" onClick={(e) => { e.stopPropagation(); ctx.remove(f); }}>×</button>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

export default function FileExplorer({ files, selected, onSelect, onCreate, onDelete, onReplaceAll, onLoadSample, folderColor, fileStatus }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const [draft, setDraft] = useState(null);
  const inputRef = useRef(null);
  const tree = useMemo(() => buildTree(Object.keys(files)), [files]);

  const ctx = {
    collapsed,
    selected,
    folderColor,
    fileStatus,
    toggle: (p) => setCollapsed((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; }),
    select: onSelect,
    remove: onDelete,
    newIn: (prefix) => setDraft(prefix),
  };

  const commit = () => {
    const p = draft?.trim().replace(/^\/+/, '');
    if (p && !p.endsWith('/')) onCreate(CODE_EXT.test(p) ? p : p + '.jsx');
    setDraft(null);
  };

  // Read a real folder from disk, entirely in the browser — nothing is uploaded or saved.
  const onFolder = async (ev) => {
    const list = [...ev.target.files].filter(
      (f) => CODE_EXT.test(f.name) && !/(^|\/)(node_modules|dist|build|\.git|coverage)\//.test(f.webkitRelativePath),
    );
    const out = {};
    for (const f of list.slice(0, 400)) {
      const rel = f.webkitRelativePath.split('/').slice(1).join('/');
      out[rel] = await f.text();
    }
    if (Object.keys(out).length) onReplaceAll(out);
    ev.target.value = '';
  };

  return (
    <div className="explorer">
      <div className="panel-head">
        <span>Project</span>
        <div className="head-actions">
          <button title="New file" onClick={() => setDraft('src/components/')}>＋ File</button>
          <button title="Open a local folder (read in-browser only)" onClick={() => inputRef.current.click()}>⇪ Folder</button>
        </div>
        <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={onFolder} />
      </div>
      {draft !== null && (
        <div className="new-file">
          <input
            autoFocus
            value={draft}
            placeholder="src/components/Foo.jsx"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null); }}
            onBlur={commit}
          />
          <div className="hint">path with folders, e.g. <code>src/pages/Cart.jsx</code> — Enter to create</div>
        </div>
      )}
      <div className="tree">
        {Object.keys(files).length === 0 ? (
          <div className="empty">
            No files yet.<br />
            <button onClick={onLoadSample}>Load sample React app</button>
          </div>
        ) : (
          <Dir node={tree} depth={0} ctx={ctx} />
        )}
      </div>
      <div className="explorer-foot">
        <button onClick={onLoadSample}>↺ Sample</button>
        <button onClick={() => onReplaceAll({})}>Clear</button>
      </div>
    </div>
  );
}
