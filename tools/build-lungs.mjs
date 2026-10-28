// Builds public/models/lungs.glb: the two lungs from the NIH Human Reference Atlas 3D reference organ
// VH_M_Lung.glb v1.2 (CC BY 4.0), merged into one light mesh for a translucent overlay.
// Run: node tools/build-lungs.mjs (source in tools/hra-src/)
import { NodeIO } from '@gltf-transform/core';
import { prune, weld, simplify, dedup, flatten, join } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/core';

const io = new NodeIO();
const doc = await io.read('tools/hra-src/VH_M_Lung.glb');
const root = doc.getRoot();
const sides = ['VH_M_lungs_L', 'VH_M_lungs_R'].map((n) => root.listNodes().find((x) => x.getName() === n));
const keep = new Set();
for (const s of sides) s.traverse((n) => keep.add(n));
for (const n of root.listNodes()) if (!keep.has(n) && n.getMesh()) n.setMesh(null);
const mat = root.listMaterials()[0];
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { p.setMaterial(mat); for (const a of ['NORMAL', 'TEXCOORD_0']) p.setAttribute(a, null); }
await doc.transform(prune(), flatten(), join(), dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.12, error: 0.001 }), prune());
const tris = root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + p.getIndices().getCount() / 3, 0), 0);
const b = getBounds(root.listScenes()[0]);
await io.write('public/models/lungs.glb', doc);
console.log('triangles', tris, 'meshes', root.listMeshes().length, 'bounds m', b.min.map((x) => x.toFixed(3)), b.max.map((x) => x.toFixed(3)));
