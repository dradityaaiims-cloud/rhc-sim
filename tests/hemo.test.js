import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, scenario, measure, pressureAt, ecgAt, labelsIn, derive, classifyPH, timing, scaleFor, beatAt } from '../src/sim/hemo.js';

const all = (id) => { const sc = scenario(id), r = {}; for (const s of ['ra', 'rv', 'pa', 'pcw']) r[s] = measure(sc, s); return { sc, r, d: derive(r, sc.co) }; };

test('normal values sit in textbook ranges', () => {
  const { r, d } = all('normal');
  assert.ok(r.ra.mean >= 2 && r.ra.mean <= 6, `RA ${r.ra.mean}`);
  assert.ok(r.rv.sys >= 15 && r.rv.sys <= 30 && r.rv.edp <= 8);
  assert.ok(r.pa.sys <= 30 && r.pa.dia >= 4 && r.pa.dia <= 14 && r.pa.mean <= 20);
  assert.ok(r.pcw.mean >= 4 && r.pcw.mean <= 12);
  assert.ok(r.ra.a > r.ra.v, 'RA: a > v');
  assert.ok(r.pcw.v > r.pcw.a, 'PCW: v > a');
  assert.ok(r.pcw.mean < r.pa.dia, 'wedge mean below PA diastolic');
  assert.ok(d.pvr < 2);
});
test('each pathology shows its signature', () => {
  let x = all('tr'); assert.ok(x.r.ra.v >= 2 * x.r.ra.a - 6 && x.r.ra.v > x.r.ra.mean + 8, 'TR: large RA v');
  x = all('mr'); assert.ok(x.r.pcw.v >= 2 * x.r.pcw.mean, 'MR: giant PCW v');
  x = all('pah'); assert.ok(x.r.pa.mean > 20 && x.r.pcw.mean <= 15 && x.d.pvr > 2, 'PAH: pre-capillary');
  x = all('hf'); assert.match(x.d.ph, /Isolated post-capillary/);
  x = all('tamponade'); { const v = [x.r.ra.mean, x.r.rv.edp, x.r.pa.dia, x.r.pcw.mean]; assert.ok(Math.max(...v) - Math.min(...v) <= 5, `equalised ${v}`); }
  x = all('ms'); assert.ok(x.r.pcw.a > x.r.pcw.v && x.r.pcw.mean >= 20, 'MS: dominant wedge a wave');
  x = all('rvi'); assert.ok(x.d.papi < 0.9 && x.r.ra.mean / x.r.pcw.mean >= 0.8, 'RVI: PAPi < 0.9, RA/PCWP >= 0.8');
  x = all('constriction'); assert.ok(x.r.rv.edp > x.r.rv.sys / 3, 'RVEDP > 1/3 RVSP');
  x = all('hypovolemia'); assert.ok(x.r.ra.mean <= 2 && x.r.pcw.mean <= 6);
});
test('constriction RA rises with inspiration (Kussmaul), normal RA falls', () => {
  const c = scenario('constriction'), n = scenario('normal'), RRn = timing(n.hr).RR;
  // compare the same cardiac phase at end-expiration and near peak inspiration
  const tIns = Math.round(2.25 / timing(c.hr).RR) * timing(c.hr).RR;
  assert.ok(pressureAt(c, 'ra', tIns) > pressureAt(c, 'ra', 0));
  const tInsN = Math.round(2.25 / RRn) * RRn;
  assert.ok(pressureAt(n, 'ra', tInsN) < pressureAt(n, 'ra', 0));
});
test('readings match the research spec seed values within 2 mmHg', () => {
  const seed = { normal: [5, 24, 4, 24, 10, 15, 8], hypovolemia: [1, 16, 1, 16, 4, 8, 3], pah: [8, 75, 12, 75, 35, 48, 9], hf: [6, 42, 10, 42, 20, 27, 20],
    tamponade: [16, 30, 16, 30, 20, 23, 17], constriction: [16, 40, 16, 40, 20, 27, 18], tr: [16, 55, 14, 50, 25, 33, 12], mr: [6, 40, 8, 40, 24, 29, 16], ms: [10, 45, 10, 45, 25, 32, 25], rvi: [14, 28, 14, 28, 16, 20, 12] };
  for (const [id, want] of Object.entries(seed)) {
    const { r } = all(id), got = [r.ra.mean, r.rv.sys, r.rv.edp, r.pa.sys, r.pa.dia, r.pa.mean, r.pcw.mean];
    got.forEach((g, i) => assert.ok(Math.abs(g - want[i]) <= 2, `${id}[${i}] ${g} vs ${want[i]}`));
  }
});
test('the PA dicrotic notch and the v waves come after the T wave; wedge a after the QRS', () => {
  for (const sc of SCENARIOS) {
    const T = timing(sc.hr), tEnd = T.tR + T.QT - 0.1; // T-wave peak
    // one beat measured from the R wave
    const at = (site, l) => labelsIn(sc, site, T.tR, T.tR + T.RR).find((x) => x.label === l).t;
    assert.ok(at('pa', 'notch') > tEnd && at('ra', 'v') > tEnd && at('pcw', 'v') > tEnd, sc.id);
    if (sc.rhythm !== 'af') assert.ok(at('pcw', 'a') < T.tR + 0.15, `${sc.id}: wedge a just after the QRS`);
  }
});
test('a ventilator breath raises pressures; end-expiratory readings are unchanged', () => {
  const n = scenario('normal'), RR = timing(n.hr).RR, t = Math.round(2.25 / RR) * RR;
  assert.ok(pressureAt(n, 'pa', t, { vent: true }) > pressureAt(n, 'pa', t, { resp: false }));
});
test('waveforms are continuous across beats and finite', () => {
  for (const sc of SCENARIOS) for (const site of ['svc', 'ra', 'rv', 'pa', 'pcw']) {
    const RR = timing(sc.hr).RR;
    const a = pressureAt(sc, site, RR - 1e-4, { resp: false }), b = pressureAt(sc, site, RR + 1e-4, { resp: false });
    assert.ok(Math.abs(a - b) < 0.2, `${sc.id} ${site}`);
    for (let t = 0; t < 2 * RR; t += 0.003) assert.ok(Number.isFinite(pressureAt(sc, site, t)));
  }
});
test('no overshoot: a beat never leaves its keypoint range', () => {
  for (const sc of SCENARIOS) {
    const m = measure(sc, 'rv');
    assert.ok(m.sys <= sc.rv.s && m.dia >= Math.min(sc.rv.min, sc.rv.edp - 2) - 0.5, sc.id);
  }
});
test('ECG R wave peaks near 1 mV, once per beat', () => {
  const sc = scenario('normal'), T = timing(sc.hr);
  assert.ok(Math.abs(ecgAt(sc, T.tR) - 1.1) < 0.15);
  assert.ok(ecgAt(sc, T.tR + 0.2) < 0.3);
});
test('RA labels a, c, x, v, y appear once per beat in order', () => {
  const sc = scenario('normal'), RR = timing(sc.hr).RR;
  assert.deepEqual(labelsIn(sc, 'ra', 0, RR).map((l) => l.label), ['a', 'c', 'x', 'v', 'y']);
  assert.equal(labelsIn(sc, 'ra', 0, 3 * RR).length, 15);
});
test('PH classification follows the 2022 ESC/ERS definitions', () => {
  assert.match(classifyPH(18, 10, 1.5), /No pulmonary/);
  assert.match(classifyPH(30, 10, 4), /Pre-capillary/);
  assert.match(classifyPH(30, 20, 1.5), /Isolated post/);
  assert.match(classifyPH(40, 20, 4), /Combined/);
});
test('monitor scale fits the case', () => {
  assert.equal(scaleFor(scenario('normal')), 40);
  assert.ok(scaleFor(scenario('pah')) >= 80);
});

test('AF: no a waves, irregular RR, continuous trace', () => {
  const sc = scenario('af');
  const labels = labelsIn(sc, 'ra', 0, 10).map((l) => l.label);
  assert.ok(!labels.includes('a') && labels.includes('v'));
  assert.equal(measure(sc, 'ra').a, null);
  const rr = []; for (let t = 0, b; rr.length < 30; t = b.start + b.RR + 1e-6) { b = beatAt(sc, t); rr.push(b.RR); }
  assert.ok(Math.max(...rr) - Math.min(...rr) > 0.2, 'irregular');
  assert.deepEqual(beatAt(sc, 7.3), beatAt(sc, 7.3), 'reproducible');
  for (const site of ['ra', 'rv', 'pa', 'pcw']) {
    let prev = pressureAt(sc, site, 0, { resp: false });
    for (let t = 0.004; t < 12; t += 0.004) { const p = pressureAt(sc, site, t, { resp: false }); assert.ok(Math.abs(p - prev) < 4, `${site} jump at ${t.toFixed(3)}: ${prev.toFixed(1)} -> ${p.toFixed(1)}`); prev = p; }
  }
  // a sinus scenario can be switched to AF
  assert.ok(!labelsIn(scenario('mr'), 'pcw', 0, 5, { af: true }).some((l) => l.label === 'a'));
});
test('under-wedge mixes PA and wedge (mean above PA diastolic); over-wedge climbs', () => {
  const sc = scenario('normal'), puw = measure(sc, 'puw'), pa = measure(sc, 'pa');
  assert.ok(puw.mean > measure(sc, 'pcw').mean && puw.mean < pa.mean);
  assert.ok(pressureAt(sc, 'ow', 1, { resp: false, owSecs: 8 }) > pressureAt(sc, 'ow', 1, { resp: false, owSecs: 0.5 }) + 8);
});
