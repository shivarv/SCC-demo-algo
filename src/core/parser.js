// Splits a virtual project (path -> source) into modules, finds the components
// each file declares, and resolves imports into a dependency graph.

export const CODE_EXT = /\.(jsx?|tsx?|mjs|cjs)$/i;
const RESOLVE_EXTS = ['', '.jsx', '.js', '.tsx', '.ts', '.mjs', '.cjs'];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function collect(re, src, group = 1) {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(src))) out.push(m[group]);
  return out;
}

export function parseFile(src) {
  const code = stripComments(src);
  const imports = [
    ...collect(/import\s+(?:type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?['"]([^'"]+)['"]/g, code).map((s) => ({ spec: s, kind: 'static' })),
    ...collect(/export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g, code).map((s) => ({ spec: s, kind: 're-export' })),
    ...collect(/require\(\s*['"]([^'"]+)['"]\s*\)/g, code).map((s) => ({ spec: s, kind: 'require' })),
    ...collect(/import\(\s*['"]([^'"]+)['"]\s*\)/g, code).map((s) => ({ spec: s, kind: 'lazy' })),
  ];

  const components = new Set([
    ...collect(/function\s+([A-Z][\w$]*)\s*\(/g, code),
    ...collect(/(?:const|let|var)\s+([A-Z][\w$]*)\s*=\s*(?:React\.)?(?:memo|forwardRef)?\(?\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/g, code),
    ...collect(/class\s+([A-Z][\w$]*)\s+extends/g, code),
  ]);
  const hooks = new Set([
    ...collect(/function\s+(use[A-Z][\w$]*)/g, code),
    ...collect(/(?:const|let)\s+(use[A-Z][\w$]*)\s*=/g, code),
  ]);

  return { imports, components: [...components], hooks: [...hooks] };
}

function normalize(path) {
  const parts = [];
  for (const p of path.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return parts.join('/');
}

function dirname(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function resolve(fromPath, spec, files) {
  let base;
  if (spec.startsWith('.')) base = normalize(dirname(fromPath) + '/' + spec);
  else if (spec.startsWith('/')) base = normalize(spec);
  else if (spec.startsWith('@/') || spec.startsWith('~/')) base = normalize('src/' + spec.slice(2));
  else if (spec.startsWith('src/')) base = normalize(spec);
  else return null; // bare package (react, lodash...) -> external

  for (const ext of RESOLVE_EXTS) if (files[base + ext] !== undefined) return base + ext;
  for (const ext of RESOLVE_EXTS.slice(1)) if (files[base + '/index' + ext] !== undefined) return base + '/index' + ext;
  return undefined; // relative but missing
}

export function buildGraph(files) {
  const paths = Object.keys(files).filter((p) => CODE_EXT.test(p)).sort();
  const nodes = [];
  const edges = [];
  const seen = new Set();

  for (const path of paths) {
    const info = parseFile(files[path]);
    const externals = [];
    const missing = [];
    for (const imp of info.imports) {
      const target = resolve(path, imp.spec, files);
      if (target === null) externals.push(imp.spec);
      else if (target === undefined) missing.push(imp.spec);
      else {
        const key = path + '→' + target;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ source: path, target, kind: imp.kind });
        }
      }
    }
    const name = path.split('/').pop();
    nodes.push({
      id: path,
      label: name.replace(CODE_EXT, ''),
      folder: dirname(path) || '/',
      components: info.components,
      hooks: info.hooks,
      externals: [...new Set(externals)],
      missing: [...new Set(missing)],
    });
  }
  return { nodes, edges };
}
