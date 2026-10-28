// Prints each named node with a mesh: world bounding box (model units) and triangle count.
import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/core';
const io = new NodeIO();
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const want = /heart|atri|ventric|valve|septum|vena|pulmonary_(artery|trunk|vein)|aorta/i;
  for (const n of doc.getRoot().listNodes()) {
    if (!n.getMesh() || !want.test(n.getName())) continue;
    const b = getBounds(n), c = b.min.map((v, i) => +((v + b.max[i]) / 2).toFixed(3)), sz = b.min.map((v, i) => +(b.max[i] - v).toFixed(3));
    const tris = n.getMesh().listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0) / 3, 0);
    console.log(n.getName().padEnd(42), 'c', c.join(','), ' size', sz.join(','), ' tris', tris, ' parent', n.listParents().map((p) => p.getName?.() ?? '').filter(Boolean).join('/'));
  }
}
