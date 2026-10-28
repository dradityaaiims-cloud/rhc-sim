import test from 'node:test';
import assert from 'node:assert/strict';
import { measureWith } from '../src/sim/artifacts.js';
import { scenario, measure } from '../src/sim/hemo.js';

const sc = scenario('normal'), pa = measure(sc, 'pa');
test('overdamping lowers systolic, raises diastolic, keeps the mean', () => {
  const m = measureWith(sc, 'pa', 'over');
  assert.ok(m.sys < pa.sys - 3 && m.dia > pa.dia && Math.abs(m.mean - pa.mean) <= 1, JSON.stringify(m));
});
test('underdamping overshoots systolic and undershoots diastolic', () => {
  const m = measureWith(sc, 'pa', 'under');
  assert.ok(m.sys > pa.sys + 2 && m.dia < pa.dia, JSON.stringify(m));
});
test('whip exaggerates the PA systolic', () => {
  assert.ok(measureWith(sc, 'pa', 'whip').sys > pa.sys + 4);
});
test('no artefact reproduces the true reading', () => {
  const m = measureWith(sc, 'pa', 'none');
  assert.ok(Math.abs(m.sys - pa.sys) <= 1 && Math.abs(m.dia - pa.dia) <= 1);
});
