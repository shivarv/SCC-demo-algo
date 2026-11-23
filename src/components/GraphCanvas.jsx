import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const C = {
  edge: new THREE.Color('#5a6fa8'),
  edgeDim: new THREE.Color('#222b48'),
  edgeLit: new THREE.Color('#9fb4ff'),
  out: new THREE.Color('#38e1ff'),
  in: new THREE.Color('#b18cff'),
  cycle: new THREE.Color('#ff3b5c'),
  tree: new THREE.Color('#ffd23f'),
  back: new THREE.Color('#ff3b5c'),
  cross: new THREE.Color('#56607a'),
  unvisited: new THREE.Color('#2a3350'),
  stack: new THREE.Color('#ffb020'),
  current: new THREE.Color('#ffffff'),
};

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

function createEngine(container, onSelect) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#05060d', 0.0022);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
  camera.position.set(0, 40, 230);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor('#05060d');
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.45, 0.32);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  scene.add(new THREE.AmbientLight('#8090c0', 0.6));
  const key = new THREE.PointLight('#ffffff', 2.2, 0, 0);
  key.position.set(120, 160, 200);
  scene.add(key);

  // starfield
  {
    const n = 1800;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      tmpV.randomDirection().multiplyScalar(500 + Math.random() * 900);
      pos.set([tmpV.x, tmpV.y, tmpV.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#5b6b9a', size: 1.6, sizeAttenuation: true, fog: false })));
  }

  const world = new THREE.Group();
  scene.add(world);

  const sphereGeo = new THREE.SphereGeometry(1, 28, 20);
  const haloGeo = new THREE.SphereGeometry(1, 24, 16);
  const nodes = new Map(); // id -> entry
  let edges = []; // { a, b, key }

  // edges as one LineSegments buffer
  let edgeCap = 0;
  const edgeGeo = new THREE.BufferGeometry();
  const edgeLines = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }),
  );
  edgeLines.frustumCulled = false;
  world.add(edgeLines);

  let arrows = null;
  let particles = null;
  const PARTICLES_PER_EDGE = 3;

  function ensureCapacity(n) {
    if (n <= edgeCap) return;
    edgeCap = Math.max(64, n * 2);
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgeCap * 6), 3).setUsage(THREE.DynamicDrawUsage));
    edgeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(edgeCap * 6), 3).setUsage(THREE.DynamicDrawUsage));
    for (const m of [arrows, particles]) if (m) { world.remove(m); m.dispose(); }
    arrows = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 4.5, 10), new THREE.MeshBasicMaterial(), edgeCap);
    particles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial(), edgeCap * PARTICLES_PER_EDGE);
    arrows.frustumCulled = particles.frustumCulled = false;
    world.add(arrows, particles);
  }
  ensureCapacity(64);

  // SCC bubbles
  let bubbles = [];
  const bubbleGeo = new THREE.IcosahedronGeometry(1, 3);
  const bubbleWire = new THREE.IcosahedronGeometry(1, 1);

  const state = {
    colorOf: () => '#60a5fa',
    cycleEdges: new Set(),
    bubbles: [],
    step: null,
    selected: null,
    hovered: null,
    showLabels: true,
    alpha: 1,
    fly: null,
  };

  function radiusOf(entry) {
    return 3 + Math.sqrt(entry.inDeg) * 1.4;
  }

  function setGraph(graph) {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const [id, e] of nodes) {
      if (!ids.has(id)) {
        world.remove(e.mesh);
        e.mesh.material.dispose();
        e.halo.material.dispose();
        nodes.delete(id);
      }
    }
    for (const n of graph.nodes) {
      let e = nodes.get(n.id);
      if (!e) {
        const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 }));
        mesh.userData.id = n.id;
        const halo = new THREE.Mesh(
          haloGeo,
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        halo.scale.setScalar(1.9);
        halo.visible = false;
        mesh.add(halo);
        const div = document.createElement('div');
        div.className = 'node-label';
        const label = new CSS2DObject(div);
        mesh.add(label);
        world.add(mesh);
        // spawn near a neighbour if we have one, so new files "grow" out of the graph
        const nb = graph.edges.find((ed) => ed.target === n.id && nodes.has(ed.source)) ||
          graph.edges.find((ed) => ed.source === n.id && nodes.has(ed.target));
        const anchor = nb ? nodes.get(nb.source === n.id ? nb.target : nb.source).pos : new THREE.Vector3();
        e = {
          id: n.id,
          mesh,
          halo,
          div,
          label,
          pos: anchor.clone().add(tmpV.randomDirection().multiplyScalar(nb ? 15 : 70 * Math.cbrt(Math.random()))),
          vel: new THREE.Vector3(),
          inDeg: 0,
        };
        nodes.set(n.id, e);
      }
      e.data = n;
      e.inDeg = 0;
    }
    edges = graph.edges
      .filter((ed) => nodes.has(ed.source) && nodes.has(ed.target))
      .map((ed) => ({ a: nodes.get(ed.source), b: nodes.get(ed.target), key: ed.source + '→' + ed.target }));
    for (const ed of edges) ed.b.inDeg++;
    ensureCapacity(edges.length);
    state.alpha = 1;
  }

  function setBubbles(list) {
    for (const b of bubbles) {
      world.remove(b.group);
      b.group.children.forEach((c) => c.material.dispose());
    }
    bubbles = list.map((b) => {
      const group = new THREE.Group();
      const fill = new THREE.Mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
      const wire = new THREE.Mesh(bubbleWire, new THREE.MeshBasicMaterial({ color: b.color, wireframe: true, transparent: true, opacity: 0.16, depthWrite: false }));
      group.add(fill, wire);
      world.add(group);
      return { ...b, group, wire, r: 10, c: new THREE.Vector3() };
    });
  }

  // ---------- physics ----------
  function simulate() {
    const list = [...nodes.values()];
    const a = Math.max(state.alpha, 0.015);
    state.alpha *= 0.992;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const q = list[j];
        tmpV.subVectors(p.pos, q.pos);
        const d2 = Math.max(tmpV.lengthSq(), 4);
        tmpV.multiplyScalar((2200 / d2 / Math.sqrt(d2)) * a);
        p.vel.add(tmpV);
        q.vel.sub(tmpV);
      }
      p.vel.addScaledVector(p.pos, -0.0035 * a);
    }
    for (const { a: p, b: q } of edges) {
      if (p === q) continue;
      tmpV.subVectors(q.pos, p.pos);
      const len = tmpV.length() || 1;
      tmpV.multiplyScalar(((len - 38) / len) * 0.035 * a);
      p.vel.add(tmpV);
      q.vel.sub(tmpV);
    }
    // keep each strongly-connected component huddled together
    for (const b of bubbles) {
      const ms = b.members.map((id) => nodes.get(id)).filter(Boolean);
      if (!ms.length) continue;
      tmpV2.set(0, 0, 0);
      ms.forEach((m) => tmpV2.add(m.pos));
      tmpV2.divideScalar(ms.length);
      ms.forEach((m) => m.vel.addScaledVector(tmpV.subVectors(tmpV2, m.pos), 0.03 * a));
    }
    for (const p of list) {
      p.vel.multiplyScalar(0.8);
      if (p.vel.lengthSq() > 25) p.vel.setLength(5);
      p.pos.add(p.vel);
    }
  }

  // ---------- styling ----------
  function nodeColor(e) {
    const st = state.step;
    if (st) {
      if (st.current === e.id) return C.current;
      if (st.done.has(e.id)) return tmpC.set(st.done.get(e.id));
      if (st.onStack.has(e.id)) return C.stack;
      return C.unvisited;
    }
    return tmpC.set(state.colorOf(e.id));
  }

  function nodeLabel(e) {
    const st = state.step;
    if (st && st.idx.has(e.id)) {
      return `${e.data.label}<span class="il">${st.idx.get(e.id)}/${st.low.get(e.id)}</span>`;
    }
    return e.data.label;
  }

  function edgeColor(ed, i) {
    const st = state.step;
    const ka = ed.a.id;
    const kb = ed.b.id;
    if (st) {
      if (st.edge && st.edge[0] === ka && st.edge[1] === kb) return C[st.edgeKind] || C.tree;
      const da = st.done.get(ka);
      if (da !== undefined && da === st.done.get(kb) && st.doneCyclic.has(ka)) return C.cycle;
      if (st.idx.has(ka) && st.idx.has(kb)) return C.edge;
      return C.edgeDim;
    }
    const sel = state.selected || state.hovered;
    if (sel) {
      if (ka === sel) return C.out;
      if (kb === sel) return C.in;
      return state.cycleEdges.has(ed.key) ? tmpC.copy(C.cycle).multiplyScalar(0.35) : C.edgeDim;
    }
    return state.cycleEdges.has(ed.key) ? C.cycle : C.edge;
  }

  function particleEdge(ed) {
    const st = state.step;
    if (st) {
      if (st.edge && st.edge[0] === ed.a.id && st.edge[1] === ed.b.id) return true;
      const da = st.done.get(ed.a.id);
      return da !== undefined && da === st.done.get(ed.b.id) && st.doneCyclic.has(ed.a.id);
    }
    return state.cycleEdges.has(ed.key);
  }

  // ---------- render loop ----------
  const clock = new THREE.Clock();
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    simulate();

    for (const e of nodes.values()) {
      const r = radiusOf(e);
      const isCur = state.step?.current === e.id;
      const pulse = isCur ? 1 + 0.25 * Math.sin(t * 8) : 1;
      e.mesh.position.copy(e.pos);
      e.mesh.scale.setScalar(r * pulse);
      const col = nodeColor(e);
      e.mesh.material.color.copy(col);
      e.mesh.material.emissive.copy(col);
      e.mesh.material.emissiveIntensity = state.step && col === C.unvisited ? 0.12 : 0.32;
      const sel = state.selected === e.id || state.hovered === e.id || isCur;
      e.halo.visible = sel;
      if (sel) e.halo.material.color.copy(col);
      const html = nodeLabel(e);
      if (e._html !== html) e.div.innerHTML = e._html = html;
      e.label.position.set(0, 1.5, 0);
      e.div.style.display = state.showLabels || sel ? '' : 'none';
      e.div.classList.toggle('sel', sel);
      e.div.classList.toggle('dim', !!state.step && !state.step.idx.has(e.id));
    }

    const pos = edgeGeo.attributes.position.array;
    const col = edgeGeo.attributes.color.array;
    let pCount = 0;
    edges.forEach((ed, i) => {
      const A = ed.a.pos;
      const B = ed.b.pos;
      const c = edgeColor(ed, i);
      if (ed.a === ed.b) {
        // self loop: tiny vertical stub
        pos.set([A.x, A.y, A.z, A.x, A.y + 12, A.z], i * 6);
      } else {
        pos.set([A.x, A.y, A.z, B.x, B.y, B.z], i * 6);
      }
      col.set([c.r * 0.55, c.g * 0.55, c.b * 0.55, c.r, c.g, c.b], i * 6);

      // arrow head sitting on the target's surface
      tmpV.subVectors(B, A);
      const len = tmpV.length() || 1;
      tmpV.divideScalar(len);
      const rb = radiusOf(ed.b) + 2.4;
      tmpV2.copy(B).addScaledVector(tmpV, -rb);
      tmpQ.setFromUnitVectors(UP, tmpV);
      tmpM.compose(tmpV2, tmpQ, tmpS.setScalar(1));
      arrows.setMatrixAt(i, tmpM);
      arrows.setColorAt(i, c);

      if (particleEdge(ed)) {
        for (let k = 0; k < PARTICLES_PER_EDGE; k++) {
          const f = (t * 0.45 + k / PARTICLES_PER_EDGE) % 1;
          tmpV2.copy(A).lerp(B, f);
          tmpM.compose(tmpV2, tmpQ.identity(), tmpS.setScalar(0.9 + 0.4 * Math.sin(f * Math.PI)));
          particles.setMatrixAt(pCount, tmpM);
          particles.setColorAt(pCount, tmpC.copy(c).multiplyScalar(1.6));
          pCount++;
        }
      }
    });
    edgeGeo.setDrawRange(0, edges.length * 2);
    edgeGeo.attributes.position.needsUpdate = true;
    edgeGeo.attributes.color.needsUpdate = true;
    arrows.count = edges.length;
    arrows.instanceMatrix.needsUpdate = true;
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
    particles.count = pCount;
    particles.instanceMatrix.needsUpdate = true;
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true;

    for (const b of bubbles) {
      const ms = b.members.map((id) => nodes.get(id)).filter(Boolean);
      if (!ms.length) { b.group.visible = false; continue; }
      b.c.set(0, 0, 0);
      ms.forEach((m) => b.c.add(m.pos));
      b.c.divideScalar(ms.length);
      let r = 0;
      ms.forEach((m) => (r = Math.max(r, m.pos.distanceTo(b.c) + radiusOf(m))));
      b.r += (r + 10 - b.r) * 0.1;
      const visible = !state.step || ms.every((m) => state.step.done.has(m.id));
      b.group.visible = visible;
      b.group.position.copy(b.c);
      b.group.scale.setScalar(b.r * (1 + 0.025 * Math.sin(t * 2 + b.r)));
      b.wire.rotation.y = t * 0.15;
      b.wire.rotation.x = t * 0.07;
    }

    if (state.fly) {
      const f = state.fly;
      f.t = Math.min(1, f.t + 0.03);
      const k = 1 - Math.pow(1 - f.t, 3);
      controls.target.lerpVectors(f.fromT, f.toT, k);
      camera.position.lerpVectors(f.fromP, f.toP, k);
      if (f.t >= 1) state.fly = null;
    }
    controls.update();
    composer.render();
    labelRenderer.render(scene, camera);
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...nodes.values()].map((e) => e.mesh), false)[0];
    return hit?.object.userData.id ?? null;
  }
  let down = null;
  const onMove = (ev) => {
    state.hovered = pick(ev);
    renderer.domElement.style.cursor = state.hovered ? 'pointer' : 'grab';
  };
  const onDown = (ev) => {
    down = [ev.clientX, ev.clientY];
    controls.autoRotate = false;
  };
  const onUp = (ev) => {
    if (down && Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) < 5) onSelect(pick(ev));
    down = null;
  };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  });
  ro.observe(container);

  frame();

  return {
    state,
    setGraph,
    setBubbles,
    focus(ids) {
      const ms = (ids?.length ? ids : [...nodes.keys()]).map((id) => nodes.get(id)).filter(Boolean);
      if (!ms.length) return;
      const c = new THREE.Vector3();
      ms.forEach((m) => c.add(m.pos));
      c.divideScalar(ms.length);
      let r = 20;
      ms.forEach((m) => (r = Math.max(r, m.pos.distanceTo(c))));
      const dir = tmpV.subVectors(camera.position, controls.target).normalize();
      state.fly = {
        t: 0,
        fromT: controls.target.clone(),
        toT: c,
        fromP: camera.position.clone(),
        toP: c.clone().addScaledVector(dir, r * 2.6 + 40),
      };
    },
    setAutoRotate(v) {
      controls.autoRotate = v;
    },
    reheat() {
      state.alpha = 1;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      container.innerHTML = '';
    },
  };
}

export default function GraphCanvas({ graph, colorOf, cycleEdges, bubbles, step, selected, onSelect, showLabels, focusRequest }) {
  const ref = useRef(null);
  const engine = useRef(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    engine.current = createEngine(ref.current, (id) => selectRef.current(id));
    return () => engine.current.dispose();
  }, []);

  useEffect(() => {
    engine.current.setGraph(graph);
  }, [graph]);

  useEffect(() => {
    engine.current.setBubbles(bubbles);
  }, [bubbles]);

  useEffect(() => {
    Object.assign(engine.current.state, { colorOf, cycleEdges, step, selected, showLabels });
  }, [colorOf, cycleEdges, step, selected, showLabels]);

  useEffect(() => {
    if (focusRequest) engine.current.focus(focusRequest.ids);
  }, [focusRequest]);

  return <div className="canvas-host" ref={ref} />;
}
