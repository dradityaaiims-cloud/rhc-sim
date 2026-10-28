import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, scenario } from '../src/sim/hemo.js';
import { satAt, fick, stepUps, thermodilution, acceptTD, vitals, mixedVenous } from '../src/sim/oximetry.js';

const run = (sc) => Object.fromEntries(['svc', 'ivc', 'ra', 'rv', 'pa', 'pcw'].map((s) => [s, satAt(sc, s)]));
test('normal: SvO2 65-75%, no step-up, wedge sample highly saturated, Fick matches CO', () => {
  const sc = scenario('normal'), s = run(sc);
  assert.ok(s.pa >= 65 && s.pa <= 75, `${s.pa}`);
  assert.deepEqual(stepUps(s), []);
  assert.ok(s.pcw >= 95);
  assert.ok(Math.abs(fick(sc, s).qs - sc.co) < 0.25);
});
test('ASD shows an atrial step-up and Qp/Qs about 2; VSD a ventricular step-up', () => {
  let sc = scenario('asd'), s = run(sc);
  assert.deepEqual(stepUps(s), ['atrial']);
  assert.ok(Math.abs(fick(sc, s).qpqs - 2) < 0.2, `${fick(sc, s).qpqs}`);
  sc = scenario('vsd'); s = run(sc);
  assert.deepEqual(stepUps(s), ['ventricular']);
  assert.ok(Math.abs(fick(sc, s).qpqs - 1.6) < 0.2);
});
test('an under-wedged sample is below 88%', () => { assert.ok(satAt(scenario('normal'), 'puw') < 88); });
test('low output scenarios have a low mixed venous saturation', () => {
  assert.ok(mixedVenous(scenario('pah')) < mixedVenous(scenario('normal')) - 5);
});
test('thermodilution: three injections within 10% in a normal heart; TR is unreliable', () => {
  let i = 0; const r = () => [0.3, 0.6, 0.5][i++ % 3];
  const vals = [1, 2, 3].map(() => thermodilution(scenario('normal'), r).co);
  const a = acceptTD(vals); assert.ok(a.ok && Math.abs(a.mean - 5) < 0.3);
  assert.equal(thermodilution(scenario('tr')).unreliable, true);
  const td = thermodilution(scenario('normal'), () => 0.5), area = td.curve.reduce((s, [, v]) => s + v * 0.05, 0);
  assert.ok(Math.abs(10 / area - td.co) < 0.05, 'Stewart-Hamilton: CO = K / area');
});
test('vitals: MAP, CI and SVR', () => {
  const v = vitals(scenario('normal'), 5);
  assert.equal(v.map, 90); assert.ok(v.svr > 900 && v.svr < 1600);
  for (const sc of SCENARIOS) assert.ok(sc.bp && sc.spo2, sc.id);
});
test('with only an SVC sample from the jugular, an ASD still gives Qp/Qs about 2', () => {
  const sc = scenario('asd'), s = { svc: satAt(sc, 'svc'), ra: satAt(sc, 'ra'), pa: satAt(sc, 'pa') };
  const f = fick(sc, s); assert.ok(Math.abs(f.qs - 5) < 0.6 && f.qpqs > 1.6, JSON.stringify(f));
});
