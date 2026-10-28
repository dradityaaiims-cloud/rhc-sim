// Builds public/models/heart.glb and src/anatomy/heartModel.js from the NIH Human Reference Atlas (HRA)
// 3D reference organs (CC BY 4.0): VH_M_Heart.glb and VH_M_Blood_Vasculature.glb, v1.2,
// https://github.com/hubmapconsortium/ccf-releases/tree/main/v1.2/models (put them in tools/hra-src/).
// Keeps the heart and the great vessels on the catheter route, simplifies them, and derives
// catheter waypoints (cm, patient frame: x left, y superior, z anterior, origin at the heart centre).
// Run: node tools/build-heart.mjs
import { NodeIO } from '@gltf-transform/core';
import { mergeDocuments, prune, weld, simplify, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { mat4, vec3 } from 'gl-matrix';
import { writeFileSync, mkdirSync } from 'node:fs';

const io = new NodeIO();
const doc = await io.read('tools/hra-src/VH_M_Heart.glb');
mergeDocuments(doc, await io.read('tools/hra-src/VH_M_Blood_Vasculature.glb'));

// part id -> HRA node name
const KEEP = {
  ra: 'VH_M_right_cardiac_atrium', rv: 'VH_M_heart_right_ventricle', la: 'VH_M_left_cardiac_atrium', lv: 'VH_M_heart_left_ventricle',
  septum: 'VH_M_interventricular_septum', tv: 'VH_M_tricuspid_valve', pv: 'VH_M_pulmonary_valve', mv: 'VH_M_mitral_valve', av: 'VH_M_aortic_valve',
  svc: 'VH_M_superior_vena_cava', ivc: 'VH_M_inferior_vena_cava_a', pa: 'VH_M_pulmonary_trunk', rpa: 'VH_M_pulmonary_artery_R', lpa: 'VH_M_pulmonary_artery_L',
  ao: 'VH_M_ascending_aorta', dao: 'VH_M_descending_aorta_a',
  pvri: 'VH_M_pulmonary_vein_R_inf', pvrs: 'VH_M_pulmonary_vein_R_sup', pvli: 'VH_M_pulmonary_vein_L_inf', pvls: 'VH_M_pulmonary_vein_L_sup',
};
const byName = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));

// world-space vertices (m) of a node's mesh
function verts(node) {
  const m = node.getWorldMatrix(), out = [];
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const w = vec3.transformMat4([], v, m); out.push(w); }
  }
  return out;
}
const mean = (ps) => ps.reduce((a, p) => a.map((x, i) => x + p[i]), [0, 0, 0]).map((x) => x / ps.length);
// principal axis by power iteration; centroids of the two end slabs (8%) along it
function ends(ps) {
  const c = mean(ps), q = ps.map((p) => p.map((x, i) => x - c[i]));
  let a = [1, 1, 1];
  for (let k = 0; k < 30; k++) {
    const n = [0, 0, 0];
    for (const p of q) { const d = p[0] * a[0] + p[1] * a[1] + p[2] * a[2]; n[0] += d * p[0]; n[1] += d * p[1]; n[2] += d * p[2]; }
    const l = Math.hypot(...n); a = n.map((x) => x / l);
  }
  const pr = q.map((p) => p[0] * a[0] + p[1] * a[1] + p[2] * a[2]).sort((x, y) => x - y);
  const lo = pr[Math.floor(pr.length * 0.08)], hi = pr[Math.floor(pr.length * 0.92)];
  const sel = (f) => mean(q.map((p, i) => [p, p[0] * a[0] + p[1] * a[1] + p[2] * a[2]]).filter(([, d]) => f(d)).map(([p]) => p.map((x, i) => x + c[i])));
  return [sel((d) => d <= lo), sel((d) => d >= hi)];
}

const V = Object.fromEntries(Object.entries(KEEP).map(([k, n]) => [k, verts(byName.get(n))]));
const all = Object.values(V).flat();
const lo = [0, 1, 2].map((i) => Math.min(...all.map((p) => p[i]))), hi = [0, 1, 2].map((i) => Math.max(...all.map((p) => p[i])));
const heartV = ['ra', 'rv', 'la', 'lv'].flatMap((k) => V[k]);
const C = mean(heartV); // origin: centre of the four chambers
const cm = (p) => p.map((x, i) => +((x - C[i]) * 100).toFixed(2));
const add = (a, b) => a.map((x, i) => x + b[i]), sub = (a, b) => a.map((x, i) => x - b[i]), mul = (a, k) => a.map((x) => x * k), lerp = (a, b, t) => add(a, mul(sub(b, a), t));

// landmarks (m)
const [svcA, svcB] = ends(V.svc), svcTop = svcA[1] > svcB[1] ? svcA : svcB, svcBot = svcTop === svcA ? svcB : svcA;
const [ivcA, ivcB] = ends(V.ivc), ivcBot = ivcA[1] < ivcB[1] ? ivcA : ivcB, ivcTop = ivcBot === ivcA ? ivcB : ivcA;
const raC = mean(V.ra), tvC = mean(V.tv), rvC = mean(V.rv), pvC = mean(V.pv);
const [paA, paB] = ends(V.pa), paDist = Math.hypot(...sub(paA, pvC)) > Math.hypot(...sub(paB, pvC)) ? paA : paB;
const [rpaA, rpaB] = ends(V.rpa), rpaEnd = rpaA[0] < rpaB[0] ? rpaA : rpaB, rpaStart = rpaEnd === rpaA ? rpaB : rpaA;
const rvApex = V.rv.reduce((a, p) => (p[1] - p[0] * 0.3 < a[1] - a[0] * 0.3 ? p : a)); // inferior-leftward tip of the RV
const branchDir = sub(rpaEnd, rpaStart).map((x, _, a) => x / Math.hypot(...a));
const wedgeStart = add(rpaEnd, mul(add(branchDir, [0, -0.6, -0.2]), 0.012));   // into a lower-lobe branch beyond the HRA vessel
const wedgeEnd = add(wedgeStart, mul(add(branchDir, [0, -0.9, -0.3]), 0.028));

const S = (p, site, mark) => ({ p: cm(p), site, ...(mark ? { mark } : {}) });
const downstream = [
  S(raC, 'ra'),
  S(tvC, 'ra', 'tv'),
  S(lerp(tvC, rvApex, 0.45), 'rv'),
  S(lerp(rvC, rvApex, 0.2), 'rv'),
  S(lerp(rvC, pvC, 0.55), 'rv'),                       // RV outflow tract
  S(pvC, 'rv', 'pv'),
  S(lerp(pvC, paDist, 0.55), 'pa'),
  S(paDist, 'pa'),                                      // near the bifurcation
  S(lerp(rpaStart, rpaEnd, 0.5), 'pa'),
  S(rpaEnd, 'pa'),
  S(wedgeStart, 'pa', 'wz'),
  S(wedgeEnd, 'pa'),
];
const up = [0, 1, 0];
const rij = [S(add(svcTop, [-0.012, 0.075, 0.004]), 'svc'), S(add(svcTop, [-0.003, 0.03, 0]), 'svc'), S(svcTop, 'svc'), S(svcBot, 'svc', 'ra')];
const fem = [S(add(ivcBot, [0.004, -0.09, 0]), 'ivc'), S(add(ivcBot, [0, -0.03, 0]), 'ivc'), S(ivcBot, 'ivc'), S(ivcTop, 'ivc', 'ra')];
const labels = Object.fromEntries(['ra', 'rv', 'la', 'lv', 'svc', 'ivc', 'pa', 'rpa', 'lpa', 'ao', 'tv', 'pv'].map((k) => [k, cm(mean(V[k]))]));

// simplify, keep only the parts, name them by id
for (const n of doc.getRoot().listNodes()) {
  const id = Object.keys(KEEP).find((k) => KEEP[k] === n.getName());
  if (id) n.setName(id);
  else if (n.getMesh()) n.setMesh(null);
}
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.0005 }), prune());
const tris = doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
// merged documents bring two buffers; a GLB holds one
const [buf, ...extra] = doc.getRoot().listBuffers();
for (const a of doc.getRoot().listAccessors()) a.setBuffer(buf);
for (const b of extra) b.dispose();
mkdirSync('public/models', { recursive: true });
await io.write('public/models/heart.glb', doc);

mkdirSync('src/anatomy', { recursive: true });
writeFileSync('src/anatomy/heartModel.js', `// Generated by tools/build-heart.mjs from the NIH Human Reference Atlas 3D reference organs (CC BY 4.0). Do not edit.
// Model units are metres; the app scales by 100 and shifts by -ORIGIN to get cm with the heart centre at 0.
export const ORIGIN = ${JSON.stringify(C.map((x) => +x.toFixed(5)))};
export const PATH = {
${Object.entries({ downstream, rij, fem }).map(([k, v]) => `  ${k}: [\n${v.map((w) => `    ${JSON.stringify(w)},`).join('\n')}\n  ],`).join('\n')}
};
export const LABELS = ${JSON.stringify(labels)};
export const BOUNDS = ${JSON.stringify({ min: cm(lo), max: cm(hi) })};
`);
console.log('triangles', tris, 'origin', C, 'bounds cm', cm(lo), cm(hi));
