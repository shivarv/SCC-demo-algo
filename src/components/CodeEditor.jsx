import { useRef } from 'react';

const SNIPPET = `import Thing from './Thing';\n`;

export default function CodeEditor({ path, value, onChange, otherFiles }) {
  const ta = useRef(null);
  const gutter = useRef(null);
  if (!path) return <div className="editor empty-editor">Select a file (in the tree or by clicking a node) to edit its imports.</div>;

  const lines = value.split('\n').length;
  const dir = path.split('/').slice(0, -1);

  // relative import from this file to another one
  const relTo = (target) => {
    const t = target.split('/');
    let i = 0;
    while (i < dir.length && dir[i] === t[i]) i++;
    const up = dir.length - i;
    const rest = t.slice(i).join('/').replace(/\.(jsx?|tsx?)$/, '');
    return (up ? '../'.repeat(up) : './') + rest;
  };

  const addImport = (target) => {
    if (!target) return;
    const name = target.split('/').pop().replace(/\.\w+$/, '').replace(/[^\w$]/g, '');
    onChange(`import ${name} from '${relTo(target)}';\n` + value);
  };

  return (
    <div className="editor">
      <div className="panel-head">
        <span className="mono">{path}</span>
        <select value="" onChange={(e) => addImport(e.target.value)} title="Insert an import to another file">
          <option value="">＋ import…</option>
          {otherFiles.filter((f) => f !== path).map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className="code-wrap">
        <div className="gutter" ref={gutter}>
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <textarea
          ref={ta}
          spellCheck={false}
          value={value}
          placeholder={SNIPPET}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => { gutter.current.scrollTop = e.target.scrollTop; }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const { selectionStart: s, selectionEnd: en } = e.target;
              const next = value.slice(0, s) + '  ' + value.slice(en);
              onChange(next);
              requestAnimationFrame(() => ta.current.setSelectionRange(s + 2, s + 2));
            }
          }}
        />
      </div>
    </div>
  );
}
