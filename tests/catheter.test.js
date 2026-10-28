import test from 'node:test';
import assert from 'node:assert/strict';
import { Catheter, buildPath, DEPTH_SCALE } from '../src/sim/catheter.js';

const drive = (c, cm, step = 0.2) => { for (let d = 0; d < Math.abs(cm); d += step) c.advance(Math.sign(cm) * step); };
const floatTo = (c, site) => { if (!c.balloon) { drive(c, 14); c.toggleBalloon(); } for (let i = 0; i < 600 && c.site !== site; i++) c.advance(0.1); };

test('path landmarks are ordered along the catheter', () => {
  for (const a of ['rij', 'fem']) {
    const P = buildPath(a);
    assert.ok(P.raEntry < P.tv && P.tv < P.pv && P.pv < P.wedgeZone && P.wedgeZone < P.total, a);
  }
});
test('the full float: SVC, RA, RV, PA, wedge, in that order', () => {
  const c = new Catheter('rij'), seen = [c.site];
  drive(c, 14); c.toggleBalloon();
  for (let i = 0; i < 400; i++) { c.advance(0.2); if (seen.at(-1) !== c.site) seen.push(c.site); }
  assert.deepEqual(seen, ['svc', 'ra', 'rv', 'pa', 'puw', 'pcw', 'ow']);
  assert.match(c.notice, /Withdraw about 1 cm/);
  drive(c, -1.2); assert.equal(c.site, 'pcw');
});
test('femoral access starts in the IVC', () => {
  const c = new Catheter('fem'); assert.equal(c.site, 'ivc');
  drive(c, 2); c.toggleBalloon(); floatTo(c, 'pcw');
  assert.equal(c.site, 'pcw');
  assert.ok(c.depth > new Catheter('rij').path.offset + 40);
});
test('without the balloon the tip will not cross the tricuspid valve', () => {
  const c = new Catheter('rij'); drive(c, 21);
  assert.equal(c.site, 'ra'); assert.match(c.notice, /balloon/i);
  drive(c, 20); assert.equal(c.site, 'ra'); assert.ok(c.depth > 40); assert.match(c.notice, /coiling/);
});
test('deflating while wedged gives a PA trace; reinflating wedges again', () => {
  const c = new Catheter('rij'); floatTo(c, 'pcw');
  assert.equal(c.site, 'pcw'); c.toggleBalloon(); assert.equal(c.site, 'pa'); c.toggleBalloon(); assert.equal(c.site, 'pcw');
});
test('an inflated balloon is not pulled back through the pulmonary valve', () => {
  const c = new Catheter('rij'); drive(c, 14); c.toggleBalloon(); drive(c, 80);
  drive(c, -60);
  assert.equal(c.site, 'pa'); assert.match(c.notice, /Deflate/);
  c.toggleBalloon(); drive(c, -60); assert.equal(c.site, 'svc');
});
test('the balloon cannot be inflated inside the sheath', () => {
  const c = new Catheter('rij'); assert.equal(c.toggleBalloon(), false); assert.match(c.notice, /sheath/);
  drive(c, 14); assert.equal(c.toggleBalloon(), true);
});
test('insertion depths match the textbook landmarks (RIJ: RA ~20, wedge ~50)', () => {
  const c = new Catheter('rij'), P = c.path, d = (s) => Math.round(P.offset + DEPTH_SCALE * s);
  assert.ok(Math.abs(d(P.raEntry) - 19) <= 2 && d(P.pv) >= 34 && d(P.pv) <= 40 && Math.abs(d(P.total) - 50) <= 2);
});
test('wedge timer counts only while wedged', () => {
  const c = new Catheter('rij'); drive(c, 14); c.toggleBalloon(); drive(c, 80);
  c.tick(5); c.tick(5); assert.equal(c.wedgeSecs, 10);
  c.toggleBalloon(); c.tick(1); assert.equal(c.wedgeSecs, 0);
});
test('tip point moves smoothly (no jumps over 1 cm per 0.2 cm step)', () => {
  const c = new Catheter('rij'); let prev = c.pointAt(0.5);
  for (let s = 0.7; s < c.path.total; s += 0.2) { const p = c.pointAt(s); assert.ok(Math.hypot(...p.map((v, i) => v - prev[i])) < 1); prev = p; }
});

test('a dilated RA coils the first float; deflate, withdraw to ~20 cm and refloat', () => {
  const c = new Catheter('rij'); c.setCoil('tv'); c.reset();
  drive(c, 14); c.toggleBalloon(); drive(c, 30);
  assert.equal(c.site, 'ra'); assert.ok(c.depth >= 40, `depth ${c.depth}`); assert.match(c.notice, /coiling/);
  c.toggleBalloon(); drive(c, -40); assert.ok(c.depth <= 22 && c.slack === 0);
  floatTo(c, 'pcw'); assert.equal(c.site, 'pcw');
});
test('whip clears after a 1 cm reposition; flushing fixes damping but never while wedged', () => {
  const c = new Catheter('rij'); floatTo(c, 'pa'); c.setArtefact('whip'); drive(c, 0.6); assert.equal(c.artefact, 'whip'); drive(c, 0.6); assert.equal(c.artefact, 'none');
  c.setArtefact('over'); floatTo(c, 'pcw'); assert.equal(c.flush(), 'unsafe'); assert.equal(c.artefact, 'over');
  c.toggleBalloon(); assert.equal(c.flush(), 'fixed'); assert.equal(c.artefact, 'none');
});
