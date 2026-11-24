import { useCallback, useEffect, useMemo, useState } from 'react';
import GraphCanvas from './components/GraphCanvas.jsx';
import FileExplorer from './components/FileExplorer.jsx';
import CodeEditor from './components/CodeEditor.jsx';
import AlgoPanel from './components/AlgoPanel.jsx';
import InsightsPanel from './components/InsightsPanel.jsx';
import { buildGraph } from './core/parser.js';
import { tarjan, findCycle, condense } from './core/tarjan.js';
import { sampleProject } from './core/sampleProject.js';

const COOL = ['#5b9dff', '#34d399', '#a78bfa', '#38bdf8', '#4ade80', '#818cf8', '#2dd4bf', '#93c5fd', '#c4b5fd'];
const HOT = ['#ff3b5c', '#ff9f1c', '#ff4fd8', '#ffd60a', '#ff6b35', '#f43f5e', '#fb7185'];

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
const folderColor = (folder) => COOL[hash(folder || '/') % COOL.length];

export default function App() {
  const [files, setFiles] = useState(sampleProject);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('files'); // files | condensed
  const [showLabels, setShowLabels] = useState(true);
  const [focusRequest, setFocusRequest] = useState(null);
  const [player, setPlayer] = useState(null); // { i, playing, speed }
  const [mobileTab, setMobileTab] = useState('graph'); // files | graph | info (narrow screens only)

  const graph = useMemo(() => buildGraph(files), [files]);
  const result = useMemo(() => tarjan(graph.nodes, graph.edges), [graph]);

  // stop stepping whenever the code (and thus the graph) changes
  useEffect(() => setPlayer(null), [graph]);

  const cycles = useMemo(
    () =>
      result.sccs
        .map((members, index) => ({ members, index }))
        .filter((c) => result.cyclic[c.index])
        .map((c, k) => ({ ...c, color: HOT[k % HOT.length], path: findCycle(c.members, result.adj) })),
    [result],
  );
  const cycleColor = useMemo(() => {
    const m = new Map();
    cycles.forEach((c) => c.members.forEach((id) => m.set(id, c.color)));
    return m;
  }, [cycles]);
  const sccColorOf = useCallback((id) => cycleColor.get(id), [cycleColor]);

  const condensed = useMemo(() => condense(graph, result), [graph, result]);
  const shown = view === 'condensed' ? condensed : graph;

  const colorOf = useCallback(
    (id) => {
      if (id.startsWith('scc:')) {
        const i = +id.slice(4);
        return result.cyclic[i] ? cycleColor.get(result.sccs[i][0]) : folderColor(condensed.nodes[i]?.folder);
      }
      return cycleColor.get(id) || folderColor(graph.nodes.find((n) => n.id === id)?.folder);
    },
    [cycleColor, graph, result, condensed],
  );

  const cycleEdges = useMemo(() => {
    if (view === 'condensed') return new Set();
    return new Set(graph.edges.filter((e) => result.cyclic[result.sccOf.get(e.source)] && result.sccOf.get(e.source) === result.sccOf.get(e.target)).map((e) => e.source + '→' + e.target));
  }, [graph, result, view]);

  const bubbles = useMemo(() => (view === 'condensed' ? [] : cycles.map((c) => ({ members: c.members, color: c.color }))), [cycles, view]);

  // ----- Tarjan replay -----
  const events = result.events;
  const step = useMemo(() => {
    if (!player || view !== 'files') return null;
    const ev = events[player.i];
    const done = new Map();
    const doneCyclic = new Set();
    for (let k = 0; k <= player.i; k++) {
      const e = events[k];
      if (e.type !== 'scc') continue;
      const cyc = result.cyclic[e.sccIndex];
      for (const n of e.scc) {
        done.set(n, cyc ? cycleColor.get(n) : folderColor(graph.nodes.find((x) => x.id === n)?.folder));
        if (cyc) doneCyclic.add(n);
      }
    }
    return { current: ev.node, edge: ev.edge, edgeKind: ev.edgeKind || (ev.type === 'return' ? 'tree' : null), onStack: new Set(ev.stack), idx: ev.idx, low: ev.low, done, doneCyclic };
  }, [player, events, view, result, cycleColor, graph]);

  useEffect(() => {
    if (!player?.playing) return;
    const id = setTimeout(() => {
      setPlayer((p) => (p.i >= events.length - 1 ? { ...p, playing: false } : { ...p, i: p.i + 1 }));
    }, 1400 / player.speed);
    return () => clearTimeout(id);
  }, [player, events.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (!player || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') setPlayer((p) => ({ ...p, playing: false, i: Math.min(events.length - 1, p.i + 1) }));
      if (e.key === 'ArrowLeft') setPlayer((p) => ({ ...p, playing: false, i: Math.max(0, p.i - 1) }));
      if (e.key === ' ') { e.preventDefault(); setPlayer((p) => ({ ...p, playing: !p.playing })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, events.length]);

  const startTarjan = () => {
    if (!events.length) return;
    setView('files');
    setSelected(null);
    setMobileTab('graph');
    setPlayer({ i: 0, playing: true, speed: 4 });
  };

  const stepSccColors = useMemo(() => step?.done || new Map(), [step]);

  // ----- file ops -----
  const select = (id) => {
    if (id && id.startsWith('scc:')) {
      const members = result.sccs[+id.slice(4)];
      setFocusRequest({ ids: members });
      setView('files');
      setSelected(members[0]);
      return;
    }
    setSelected(id);
  };
  const createFile = (path) => {
    setFiles((f) => (f[path] !== undefined ? f : { ...f, [path]: `export default function ${path.split('/').pop().replace(/\.\w+$/, '').replace(/[^\w$]/g, '')}() {\n  return null;\n}\n` }));
    setSelected(path);
  };
  const deleteFile = (path) => {
    setFiles((f) => {
      const n = { ...f };
      delete n[path];
      return n;
    });
    if (selected === path) setSelected(null);
  };
  const replaceAll = (obj) => {
    setFiles(obj);
    setSelected(null);
    setTimeout(() => setFocusRequest({ ids: null }), 1200);
  };

  const fileStatus = (path) => ({ cycleColor: cycleColor.get(path) });

  return (
    <div className={`app tab-${mobileTab}${player && step ? ' playing' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="logo"><span /><span /><span /></div>
          <div>
            <h1>SCCs Demo</h1>
            <p>React import graph → strongly connected components → circular dependencies</p>
          </div>
        </div>
        <div className="toolbar">
          <button className="primary glow" onClick={startTarjan}>▶ Run Tarjan's SCC</button>
          <div className="seg">
            <button className={view === 'files' ? 'on' : ''} onClick={() => setView('files')}>Files graph</button>
            <button className={view === 'condensed' ? 'on' : ''} onClick={() => { setPlayer(null); setView('condensed'); }}>Condensed DAG</button>
          </div>
          <button className={showLabels ? 'on' : ''} onClick={() => setShowLabels((s) => !s)}>Labels</button>
          <button onClick={() => setFocusRequest({ ids: null })}>Fit</button>
        </div>
      </header>

      <aside className="left">
        <FileExplorer
          files={files}
          selected={selected}
          onSelect={select}
          onCreate={createFile}
          onDelete={deleteFile}
          onReplaceAll={replaceAll}
          onLoadSample={() => replaceAll(sampleProject)}
          folderColor={folderColor}
          fileStatus={fileStatus}
        />
        <CodeEditor
          path={selected && files[selected] !== undefined ? selected : null}
          value={files[selected] ?? ''}
          onChange={(v) => setFiles((f) => ({ ...f, [selected]: v }))}
          otherFiles={Object.keys(files)}
        />
      </aside>

      <main className="stage">
        <GraphCanvas
          graph={shown}
          colorOf={colorOf}
          cycleEdges={cycleEdges}
          bubbles={bubbles}
          step={step}
          selected={view === 'files' ? selected : null}
          onSelect={select}
          showLabels={showLabels}
          focusRequest={focusRequest}
        />
        <div className="legend">
          {step ? (
            <>
              <span><i style={{ background: '#2a3350' }} />unvisited</span>
              <span><i style={{ background: '#ffb020' }} />on stack</span>
              <span><i style={{ background: '#fff' }} />current</span>
              <span><b style={{ background: '#ffd23f' }} />tree edge</span>
              <span><b style={{ background: '#ff3b5c' }} />back edge / cycle</span>
            </>
          ) : view === 'condensed' ? (
            <span>Each SCC collapsed into one node — the result is always acyclic. Click a cycle node to expand it.</span>
          ) : (
            <>
              <span><i style={{ background: '#5b9dff' }} />file (colour = folder)</span>
              <span><i style={{ background: '#ff3b5c' }} />in a cycle</span>
              <span><b style={{ background: '#ff3b5c' }} />cyclic import</span>
              <span><b style={{ background: '#38e1ff' }} />imports</span>
              <span><b style={{ background: '#b18cff' }} />imported by</span>
            </>
          )}
        </div>
        <div className="drag-hint">drag to orbit · scroll to zoom · click a node</div>
      </main>

      <aside className="right">
        {player && step ? (
          <AlgoPanel player={player} setPlayer={setPlayer} events={events} sccColors={stepSccColors} onExit={() => setPlayer(null)} />
        ) : (
          <InsightsPanel
            graph={graph}
            result={result}
            cycles={cycles}
            selected={selected}
            onSelect={select}
            onFocus={(ids) => { setView('files'); setMobileTab('graph'); setFocusRequest({ ids }); }}
            sccColorOf={sccColorOf}
          />
        )}
      </aside>

      <nav className="tabbar">
        <button className={mobileTab === 'files' ? 'on' : ''} onClick={() => setMobileTab('files')}>
          <span className="tab-icon">▤</span>Code
        </button>
        <button className={mobileTab === 'graph' ? 'on' : ''} onClick={() => setMobileTab('graph')}>
          <span className="tab-icon">◉</span>Graph
        </button>
        <button className={mobileTab === 'info' ? 'on' : ''} onClick={() => setMobileTab('info')}>
          <span className="tab-icon">≡</span>{player && step ? 'Steps' : 'Insights'}
          {cycles.length > 0 && <span className="tab-badge">{cycles.length}</span>}
        </button>
      </nav>
    </div>
  );
}
