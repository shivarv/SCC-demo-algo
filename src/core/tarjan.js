// Tarjan's strongly-connected-components algorithm, written iteratively so it
// never blows the call stack, and recording every step so the UI can replay it.

export function adjacency(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) adj.get(e.source)?.push(e.target);
  return adj;
}

export function tarjan(nodes, edges, { record = true } = {}) {
  const adj = adjacency(nodes, edges);
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  const events = [];
  let counter = 0;

  const emit = (e) => {
    if (record) events.push({ ...e, stack: [...stack], idx: new Map(idx), low: new Map(low) });
  };

  const discover = (v, from) => {
    idx.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    emit({ type: 'visit', node: v, from, text: `visit ${v} → index = low = ${idx.get(v)}, push on stack` });
  };

  for (const { id: start } of nodes) {
    if (idx.has(start)) continue;
    discover(start, null);
    const work = [[start, 0]];

    while (work.length) {
      const frame = work[work.length - 1];
      const v = frame[0];
      const nbrs = adj.get(v);

      if (frame[1] < nbrs.length) {
        const w = nbrs[frame[1]++];
        if (!idx.has(w)) {
          emit({ type: 'edge', edge: [v, w], edgeKind: 'tree', node: v, text: `explore ${v} → ${w} (unvisited, recurse)` });
          discover(w, v);
          work.push([w, 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), idx.get(w)));
          emit({ type: 'edge', edge: [v, w], edgeKind: 'back', node: v, text: `back-edge ${v} → ${w} (on stack!) low[${v}] = ${low.get(v)}` });
        } else {
          emit({ type: 'edge', edge: [v, w], edgeKind: 'cross', node: v, text: `skip ${v} → ${w} (already in a finished SCC)` });
        }
        continue;
      }

      work.pop();
      if (low.get(v) === idx.get(v)) {
        const comp = [];
        let w;
        do {
          w = stack.pop();
          onStack.delete(w);
          comp.push(w);
        } while (w !== v);
        sccs.push(comp);
        emit({
          type: 'scc',
          node: v,
          scc: comp,
          sccIndex: sccs.length - 1,
          text: comp.length > 1
            ? `${v} is a root (low = index). Pop SCC of ${comp.length} → CYCLE`
            : `${v} is a root. Pop SCC {${v}}`,
        });
      }
      if (work.length) {
        const parent = work[work.length - 1][0];
        const before = low.get(parent);
        low.set(parent, Math.min(before, low.get(v)));
        emit({ type: 'return', node: parent, edge: [parent, v], text: `return to ${parent}, low[${parent}] = min(${before}, ${low.get(v)}) = ${low.get(parent)}` });
      }
    }
  }

  const selfLoops = new Set(edges.filter((e) => e.source === e.target).map((e) => e.source));
  const cyclic = sccs.map((c) => c.length > 1 || selfLoops.has(c[0]));
  const sccOf = new Map();
  sccs.forEach((c, i) => c.forEach((n) => sccOf.set(n, i)));

  return { sccs, cyclic, sccOf, events, adj };
}

// One concrete loop inside an SCC, e.g. A → B → C → A (BFS restricted to the SCC).
export function findCycle(scc, adj) {
  const members = new Set(scc);
  const start = scc[scc.length - 1];
  const prev = new Map();
  const queue = [start];
  while (queue.length) {
    const v = queue.shift();
    for (const w of adj.get(v) || []) {
      if (!members.has(w)) continue;
      if (w === start) {
        const path = [start];
        let cur = v;
        const back = [];
        while (cur !== start) {
          back.push(cur);
          cur = prev.get(cur);
        }
        return [...path, ...back.reverse(), start];
      }
      if (!prev.has(w)) {
        prev.set(w, v);
        queue.push(w);
      }
    }
  }
  return [start];
}

// Collapse every SCC into one super-node: the result is always a DAG.
export function condense(graph, result) {
  const nodes = result.sccs.map((c, i) => ({
    id: `scc:${i}`,
    label: c.length > 1 ? `SCC ${i} · ${c.length} files` : c[0].split('/').pop().replace(/\.\w+$/, ''),
    folder: c.length > 1 ? 'cycle' : graph.nodes.find((n) => n.id === c[0])?.folder,
    members: c,
    components: [],
    hooks: [],
    externals: [],
    missing: [],
  }));
  const seen = new Set();
  const edges = [];
  for (const e of graph.edges) {
    const a = result.sccOf.get(e.source);
    const b = result.sccOf.get(e.target);
    if (a === b) continue;
    const key = a + '>' + b;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ source: `scc:${a}`, target: `scc:${b}`, kind: 'static' });
  }
  return { nodes, edges };
}
