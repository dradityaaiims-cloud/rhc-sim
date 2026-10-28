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
// the merge adds a second scene, and viewers load only the default one: move the vessels into the heart's scene
const [scene, ...scenes] = doc.getRoot().listScenes();
for (const sc of scenes) { for (const n of sc.listChildren()) scene.addChild(n); sc.dispose(); }
doc.getRoot().setDefaultScene(scene);

// part id -> HRA node name
const KEEP = {
  ra: 'VH_M_right_cardiac_atrium', rv: 'VH_M_heart_right_ventricle', la: 'VH_M_left_cardiac_atrium', lv: 'VH_M_heart_left_ventricle',
  septum: 'VH_M_interventricular_septum', tv: 'VH_M_tricuspid_valve', pv: 'VH_M_pulmonary_valve', mv: 'VH_M_mitral_valve', av: 'VH_M_aortic_valve',
  svc: 'VH_M_superior_vena_cava', bcv: 'VH_M_brachiocephalic_vein_R',
  ivc: 'VH_M_inferior_vena_cava_a', ivc2: 'VH_M_inferior_vena_cava_b', cil: 'VH_M_common_iliac_vein_R', eil: 'VH_M_external_iliac_vein_R',
  pa: 'VH_M_pulmonary_trunk', rpa: 'VH_M_pulmonary_artery_R', lpa: 'VH_M_pulmonary_artery_L',
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
const add = (a, b) => a.map((x, i) => x + b[i]), sub = (a, b) => a.map((x, i) => x - b[i]), mul = (a, k) => a.map((x) => x * k), lerp = (a, b, t) => add(a, mul(sub(b, a), t));
const dist = (a, b) => Math.hypot(...sub(a, b)), norm = (a) => mul(a, 1 / Math.hypot(...a));
const mean = (ps) => ps.reduce((a, p) => a.map((x, i) => x + p[i]), [0, 0, 0]).map((x) => x / ps.length);

/** Vessel centreline: slabs along the principal axis; each slab gives a centroid and a mean radius. */
function centerline(ps, n) {
  const c = mean(ps), q = ps.map((p) => sub(p, c));
  let a = [1, 1, 1];
  for (let k = 0; k < 30; k++) {
    const m = [0, 0, 0];
    for (const p of q) { const d = p[0] * a[0] + p[1] * a[1] + p[2] * a[2]; m[0] += d * p[0]; m[1] += d * p[1]; m[2] += d * p[2]; }
    a = norm(m);
  }
  const d = q.map((p) => p[0] * a[0] + p[1] * a[1] + p[2] * a[2]), lo = d.reduce((m, x) => Math.min(m, x)), w = (d.reduce((m, x) => Math.max(m, x)) - lo) / n, out = [];
  for (let k = 0; k < n; k++) {
    const sl = ps.filter((_, i) => d[i] >= lo + k * w && d[i] <= lo + (k + 1) * w);
    if (sl.length < 8) continue;
    const ctr = mean(sl);
    out.push({ p: ctr, r: sl.reduce((s, p) => s + dist(p, ctr), 0) / sl.length });
  }
  return out;
}
/** Laplacian smoothing of a chained route (ends fixed): slab centroids are noisy where vessels branch. */
function smooth(ws, iters = 3) {
  let p = ws.map((w) => w.p);
  for (let k = 0; k < iters; k++) p = p.map((x, i) => (i === 0 || i === p.length - 1 ? x : mul(add(add(p[i - 1], p[i + 1]), mul(x, 2)), 0.25)));
  return ws.map((w, i) => ({ ...w, p: p[i] }));
}
/** Orient a centreline so it starts at the end nearest `from`. */
const orient = (cl, from) => (dist(cl[0].p, from) <= dist(cl.at(-1).p, from) ? cl : [...cl].reverse());

const V = Object.fromEntries(Object.entries(KEEP).map(([k, n]) => [k, verts(byName.get(n))]));
const all = Object.values(V).flat();
const lo = [0, 1, 2].map((i) => all.reduce((m, p) => Math.min(m, p[i]), Infinity)), hi = [0, 1, 2].map((i) => all.reduce((m, p) => Math.max(m, p[i]), -Infinity));
const C = mean(['ra', 'rv', 'la', 'lv'].flatMap((k) => V[k])); // origin: centre of the four chambers
const cm = (p) => p.map((x, i) => +((x - C[i]) * 100).toFixed(2));

const raC = mean(V.ra), tvC = mean(V.tv), rvC = mean(V.rv), pvC = mean(V.pv);
const rvApex = V.rv.reduce((a, p) => (p[1] - p[0] * 0.3 < a[1] - a[0] * 0.3 ? p : a)); // inferior-leftward tip of the RV

// venous routes, each vessel's centreline chained end to end
const svc = orient(centerline(V.svc, 6), raC).reverse();                    // top -> RA
const bcv = orient(centerline(V.bcv, 4), svc[0].p).reverse();              // lateral end -> SVC
const ivc = orient(centerline(V.ivc, 6), raC).reverse();                    // bottom -> RA
const ivc2 = orient(centerline(V.ivc2, 14), ivc[0].p).reverse();           // pelvis -> upper IVC
const cil = orient(centerline(V.cil, 6), ivc2[0].p).reverse();
const eil = orient(centerline(V.eil, 6), cil[0].p).reverse();               // groin -> common iliac
const pa = orient(centerline(V.pa, 6), pvC);                                 // valve -> bifurcation
const rpa = orient(centerline(V.rpa, 6), pa.at(-1).p);                      // bifurcation -> hilum

// drawn continuations leave each model vessel along its own end tangent, at its own radius
const tangent = (cl, atEnd) => (atEnd ? norm(sub(cl.at(-1).p, cl.at(-2).p)) : norm(sub(cl[0].p, cl[1].p)));
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const ij0 = bcv[0].p, ijT = tangent(bcv, false);
const ij1 = add(ij0, mul(norm(add(mul(ijT, 0.6), UP)), 0.035)), ij2 = add(ij1, mul(norm(add(mul(ijT, 0.1), UP)), 0.06));
const fv0 = eil[0].p, fvT = tangent(eil, false);
// a short common femoral segment below the inguinal ligament, where the vein is punctured
const fv1 = add(fv0, mul(norm(add(fvT, mul(DOWN, 0.5))), 0.02)), fv2 = add(fv1, mul(norm(add(mul(fvT, 0.3), DOWN)), 0.025));
const br0 = rpa.at(-1).p, brT = tangent(rpa, true);
const br1 = add(br0, mul(brT, 0.012)), br2 = add(br1, mul(norm(add(brT, [0, -0.8, -0.3])), 0.036));

const S = (p, site, mark) => ({ p: cm(p), site, ...(mark ? { mark } : {}) });
const smoothed = (ws) => smooth(ws.map((w) => ({ ...w, p: w.p.map((x, i) => x / 100 + C[i]) }))).map((w) => ({ ...w, p: cm(w.p) }));
const along = (cl, site) => cl.map((w) => S(w.p, site));
const downstream = [
  S(raC, 'ra'),
  S(tvC, 'ra', 'tv'),
  S(lerp(tvC, rvApex, 0.45), 'rv'),
  S(lerp(rvC, rvApex, 0.2), 'rv'),
  S(lerp(rvC, pvC, 0.55), 'rv'),                                // RV outflow tract
  // valve -> trunk -> right PA -> lower-lobe branch beyond the HRA vessel, smoothed through the bifurcation
  ...smoothed([S(pvC, 'rv', 'pv'), ...along(pa.slice(1), 'pa'), ...along(rpa.slice(1), 'pa'), S(br1, 'pa', 'wz'), S(br2, 'pa')]),
];
const rij = smoothed([S(ij2, 'svc'), S(ij1, 'svc'), ...along(bcv, 'svc'), ...along(svc.slice(0, -1), 'svc'), S(svc.at(-1).p, 'svc', 'ra')]);
const fem = smoothed([S(fv2, 'ivc'), S(fv1, 'ivc'), ...along([...eil, ...cil, ...ivc2, ...ivc.slice(0, -1)], 'ivc'), S(ivc.at(-1).p, 'ivc', 'ra')]);
const r = (x) => +(x * 100).toFixed(2);
const ext = {
  ext_svc: { pts: [ij2, ij1, ij0, bcv[1].p].map(cm), r: r(bcv[0].r * 0.9) },
  ext_ivc: { pts: [fv2, fv1, fv0, eil[1].p].map(cm), r: r(eil[0].r * 0.9) },
  branch: { pts: [rpa.at(-2).p, br0, br1, br2].map(cm), r: r(rpa.at(-1).r * 0.8) },
};
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
// drawn continuations (cm): the internal jugular, femoral vein and distal right PA branch, matched to the model vessel ends
export const EXT = ${JSON.stringify(ext)};
export const BOUNDS = ${JSON.stringify({ min: cm(lo), max: cm(hi) })};
`);
console.log('triangles', tris, 'origin', C, 'bounds cm', cm(lo), cm(hi));
