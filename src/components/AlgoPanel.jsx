const short = (id) => id.split('/').pop().replace(/\.\w+$/, '');

export default function AlgoPanel({ player, setPlayer, events, sccColors, onExit }) {
  const ev = events[player.i];
  const pct = ((player.i + 1) / events.length) * 100;
  const rows = [...ev.idx.keys()].sort((a, b) => ev.idx.get(a) - ev.idx.get(b));
  const go = (i) => setPlayer((p) => ({ ...p, i: Math.max(0, Math.min(events.length - 1, i)), playing: false }));

  return (
    <div className="algo">
      <div className="algo-head">
        <div>
          <div className="eyebrow">Tarjan's algorithm</div>
          <div className="step-count">step {player.i + 1} / {events.length}</div>
        </div>
        <button className="ghost" onClick={onExit}>✕ exit</button>
      </div>

      <div className="progress"><div style={{ width: pct + '%' }} /></div>

      <div className="transport">
        <button onClick={() => go(0)} title="First">⏮</button>
        <button onClick={() => go(player.i - 1)} title="Back (←)">◀</button>
        <button className="primary" onClick={() => setPlayer((p) => ({ ...p, playing: !p.playing, i: p.i >= events.length - 1 ? 0 : p.i }))}>
          {player.playing ? '❚❚ pause' : '▶ play'}
        </button>
        <button onClick={() => go(player.i + 1)} title="Forward (→)">▶</button>
        <button onClick={() => go(events.length - 1)} title="Last">⏭</button>
      </div>
      <label className="speed">
        speed
        <input type="range" min="1" max="12" value={player.speed} onChange={(e) => setPlayer((p) => ({ ...p, speed: +e.target.value }))} />
      </label>

      <div className={'event ' + ev.type + (ev.edgeKind ? ' ' + ev.edgeKind : '') + (ev.type === 'scc' && ev.scc.length > 1 ? ' cyc' : '')}>
        <span className="tag">{ev.type === 'edge' ? ev.edgeKind : ev.type}</span>
        {ev.text.replace(/src\/|[\w/]*\//g, '')}
      </div>

      <div className="algo-grid">
        <div>
          <div className="mini-title">stack (top ↑)</div>
          <div className="stack">
            {[...ev.stack].reverse().map((n) => (
              <div key={n} className={'chip' + (n === ev.node ? ' cur' : '')}>{short(n)}</div>
            ))}
            {!ev.stack.length && <div className="muted">empty</div>}
          </div>
        </div>
        <div>
          <div className="mini-title">index / low-link</div>
          <table className="il-table">
            <tbody>
              {rows.map((n) => {
                const color = sccColors.get(n);
                return (
                  <tr key={n} className={n === ev.node ? 'cur' : ''}>
                    <td><span className="dot" style={{ background: color || (ev.stack.includes(n) ? '#ffb020' : '#2a3350') }} />{short(n)}</td>
                    <td>{ev.idx.get(n)}</td>
                    <td className={ev.low.get(n) < ev.idx.get(n) ? 'lowered' : ''}>{ev.low.get(n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="explain">
        <b>low-link</b> = smallest index reachable via the DFS subtree plus one back-edge. When a node finishes with
        <code> low == index</code> it's the root of a component: everything above it on the stack is popped as one SCC.
        An SCC with more than one file is a <span className="red">circular dependency</span>.
      </p>
    </div>
  );
}
