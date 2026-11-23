const short = (id) => id.split('/').pop();

export default function InsightsPanel({ graph, result, cycles, selected, onSelect, onFocus, sccColorOf }) {
  const node = graph.nodes.find((n) => n.id === selected);
  const outs = graph.edges.filter((e) => e.source === selected);
  const ins = graph.edges.filter((e) => e.target === selected);
  const nonTrivial = cycles.length;

  return (
    <div className="insights">
      <div className="stats">
        <div><b>{graph.nodes.length}</b><span>files</span></div>
        <div><b>{graph.edges.length}</b><span>imports</span></div>
        <div><b>{result.sccs.length}</b><span>SCCs</span></div>
        <div className={nonTrivial ? 'bad' : 'good'}><b>{nonTrivial}</b><span>cycles</span></div>
      </div>

      {node && (
        <div className="card detail">
          <div className="card-title">
            <span className="mono">{node.id}</span>
            <button className="ghost" onClick={() => onSelect(null)}>✕</button>
          </div>
          {sccColorOf(node.id) && <div className="pill red">in circular dependency</div>}
          {node.components.length > 0 && (
            <div className="kv"><span>components</span><div>{node.components.map((c) => <code key={c} className="comp">&lt;{c} /&gt;</code>)}</div></div>
          )}
          {node.hooks.length > 0 && (
            <div className="kv"><span>hooks</span><div>{node.hooks.map((c) => <code key={c} className="hook">{c}()</code>)}</div></div>
          )}
          <div className="kv"><span className="out">imports →</span><div>{outs.length ? outs.map((e) => <a key={e.target} onClick={() => onSelect(e.target)}>{short(e.target)}{e.kind === 'lazy' && <i> lazy</i>}</a>) : <em>nothing local</em>}</div></div>
          <div className="kv"><span className="in">← used by</span><div>{ins.length ? ins.map((e) => <a key={e.source} onClick={() => onSelect(e.source)}>{short(e.source)}</a>) : <em>no one (entry / dead?)</em>}</div></div>
          {node.externals.length > 0 && <div className="kv"><span>packages</span><div>{node.externals.map((x) => <code key={x}>{x}</code>)}</div></div>}
          {node.missing.length > 0 && <div className="kv"><span className="warn">unresolved</span><div>{node.missing.map((x) => <code key={x} className="warn">{x}</code>)}</div></div>}
        </div>
      )}

      <div className="section-title">Circular dependencies</div>
      {nonTrivial === 0 ? (
        <div className="card ok">✓ No cycles — the import graph is a DAG. Every SCC is a single file.</div>
      ) : (
        cycles.map((c) => (
          <div key={c.index} className="card cycle" style={{ '--c': c.color }} onClick={() => onFocus(c.members)}>
            <div className="card-title">
              <span><span className="dot" style={{ background: c.color }} />SCC #{c.index}</span>
              <span className="muted">{c.members.length} file{c.members.length > 1 ? 's' : ''}</span>
            </div>
            <div className="loop">
              {c.path.map((p, i) => (
                <span key={i}>
                  {i > 0 && <span className="arrow">→</span>}
                  <a onClick={(e) => { e.stopPropagation(); onSelect(p); }}>{short(p).replace(/\.\w+$/, '')}</a>
                </span>
              ))}
            </div>
            {c.members.length > c.path.length - 1 && (
              <div className="muted small">+ {c.members.length - (c.path.length - 1)} more file(s) tangled in this component</div>
            )}
            <div className="hint">Break it: remove one import on this loop (e.g. <code>{short(c.path[c.path.length - 2])} → {short(c.path[c.path.length - 1])}</code>) or extract shared code into a new module.</div>
          </div>
        ))
      )}
    </div>
  );
}
