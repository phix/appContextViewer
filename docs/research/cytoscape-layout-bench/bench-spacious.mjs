import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import elk from 'cytoscape-elk';
import fcose from 'cytoscape-fcose';
import cola from 'cytoscape-cola';
cytoscape.use(dagre); cytoscape.use(elk); cytoscape.use(fcose); cytoscape.use(cola);

// deterministic PRNG
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

function makeGraph(n, edgesPer, groupSize, compound) {
  seed = 42;
  const els = [];
  const groups = Math.ceil(n / groupSize);
  if (compound) for (let g = 0; g < groups; g++) els.push({ data: { id: `g${g}`, label: `repo-${g}` } });
  for (let i = 0; i < n; i++) els.push({ data: { id: `n${i}`, label: `app-${i}`, ...(compound ? { parent: `g${Math.floor(i / groupSize)}` } : {}) } });
  const seen = new Set();
  for (let i = 0; i < n; i++) for (let k = 0; k < edgesPer; k++) {
    // mostly forward (DAG-like), 5% backward to create cycles; 60% within own group when compound
    let j;
    if (compound && rnd() < 0.6) { const g = Math.floor(i / groupSize); j = g * groupSize + Math.floor(rnd() * groupSize); if (j >= n) j = n - 1; }
    else j = rnd() < 0.05 ? Math.floor(rnd() * i) : i + 1 + Math.floor(rnd() * Math.max(1, n - i - 1));
    if (j === i || j >= n || j < 0) continue;
    const key = `${i}-${j}`; if (seen.has(key)) continue; seen.add(key);
    els.push({ data: { id: `e${key}`, source: `n${i}`, target: `n${j}` } });
  }
  return els;
}

function metrics(cy) {
  const nodes = cy.nodes().not(':parent');
  const bb = nodes.boundingBox();
  // group intrusion: foreign nodes inside a parent's bbox
  let intrusions = 0, parents = cy.nodes(':parent');
  parents.forEach(p => { const pb = p.children().boundingBox(); nodes.forEach(nd => { if (nd.parent().id() === p.id()) return; const q = nd.position(); if (q.x >= pb.x1 && q.x <= pb.x2 && q.y >= pb.y1 && q.y <= pb.y2) intrusions++; }); });
  // node overlap: pairs of nodes closer than node size (120x30) on both axes
  const pos = nodes.map(nd => nd.position()); let overlaps = 0;
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) if (Math.abs(pos[i].x - pos[j].x) < 120 && Math.abs(pos[i].y - pos[j].y) < 30) overlaps++;
  // straight-line edge crossings
  const segs = cy.edges().map(e => [e.source().position(), e.target().position()]);
  const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) { const [a, b] = segs[i], [c, d] = segs[j]; if (a === c || a === d || b === c || b === d) continue; if (cross(a, b, c, d)) crossings++; }
  return { area_Mpx: +((bb.w * bb.h) / 1e6).toFixed(1), intrusions, overlaps, crossings };
}

const LAYOUTS = {
  breadthfirst: { name: 'breadthfirst', directed: true, spacingFactor: 1 },
  cose:         { name: 'cose', animate: false, randomize: true, numIter: 1000, nodeRepulsion: 200000, idealEdgeLength: 160, nodeOverlap: 40 },
  dagre:        { name: 'dagre', rankDir: 'TB', nodeSep: 30, rankSep: 60 },
  elk:          { name: 'elk', elk: { algorithm: 'layered', 'elk.direction': 'DOWN', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.layered.spacing.nodeNodeBetweenLayers': 60 } },
  fcose:        { name: 'fcose', animate: false, randomize: true, quality: 'default', nodeRepulsion: 45000, idealEdgeLength: 160, nodeSeparation: 80 },
  cola:         { name: 'cola', animate: false, maxSimulationTime: 15000, nodeSpacing: 10, avoidOverlap: true },
};

async function runOne(layoutKey, n, compound) {
  const els = makeGraph(n, 3, 10, compound);
  const cy = cytoscape({ headless: true, styleEnabled: true, elements: els, style: [{ selector: 'node', style: { width: 120, height: 30 } }] });
  const opts = { ...LAYOUTS[layoutKey], fit: false, animate: false };
  const l = cy.layout(opts);
  const t0 = performance.now();
  const done = l.promiseOn('layoutstop');
  l.run();
  await done;
  const ms = performance.now() - t0;
  const m = metrics(cy);
  cy.destroy();
  return { layout: layoutKey, n, edges: els.filter(e => e.data.source).length, compound, ms: Math.round(ms), ...m };
}

const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(LAYOUTS);
const sizes = process.argv[3] ? process.argv[3].split(',').map(Number) : [30, 200, 500, 1000];
const results = [];
for (const lk of only) for (const n of sizes) for (const compound of [false, true]) {
  if (lk === 'breadthfirst' && !compound && n > 30) { /* still run */ }
  const timeout = new Promise(r => setTimeout(() => r({ layout: lk, n, compound, ms: 'timeout>60s' }), 60000));
  const r = await Promise.race([runOne(lk, n, compound), timeout]);
  results.push(r); console.error(JSON.stringify(r));
  if (typeof r.ms === 'string' || r.ms > 30000) break; // don't try larger sizes for this layout/mode
}
import("fs").then(fs => fs.writeFileSync(`results/spacious_${only.join("_")}.json`, JSON.stringify(results, null, 1)));
