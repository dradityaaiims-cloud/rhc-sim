import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRun, diagnosisOptions, waveformQuestion, RECORD_SITES } from '../src/modes/scoring.js';
import { nextRule, RULES, GENERAL } from '../src/ui/bobaRules.js';
import { SECTIONS } from '../src/learn/content.js';
import { SCENARIOS } from '../src/sim/hemo.js';

const full = Object.fromEntries(RECORD_SITES.map((s) => [s, { site: s }]));
test('a clean, quick, complete run scores 100', () => {
  assert.equal(scoreRun({ recorded: full, blocked: 0, pullbacks: 0, wedgeMax: 8, secs: 90 }).total, 100);
});
test('unsafe habits cost points and get teaching notes', () => {
  const r = scoreRun({ recorded: full, blocked: 2, pullbacks: 1, wedgeMax: 40, secs: 300 });
  assert.equal(r.total, 60 + 5 + 6 + 0);
  assert.ok(r.notes.some((n) => /deflate/i.test(n)) && r.notes.some((n) => /wedged for 40/.test(n)));
});
test('diagnosis is worth 20 of 100 in the game', () => {
  const base = { recorded: full, blocked: 0, pullbacks: 0, wedgeMax: 5, secs: 60 };
  assert.equal(scoreRun({ ...base, diagnosis: true }).total, 100);
  assert.equal(scoreRun({ ...base, diagnosis: false }).total, 80);
});
test('diagnosis options hold the answer and 3 distinct distractors', () => {
  for (const s of SCENARIOS) { const o = diagnosisOptions(s.id); assert.equal(o.length, 4); assert.ok(o.includes(s.id)); assert.equal(new Set(o).size, 4); }
});
test('waveform questions use recordable sites and real scenarios', () => {
  for (let i = 0; i < 50; i++) { const q = waveformQuestion(); assert.ok(RECORD_SITES.includes(q.site)); assert.ok(SCENARIOS.some((s) => s.id === q.scenarioId)); }
});

const ctx = (o = {}) => ({ t: 10, mode: 'explore', site: 'svc', balloon: false, notice: null, wedgeSecs: 0, scenario: 'normal', artefact: 'none', af: false, slack: 0,
  flags: { usedFluoro: true, moved: true, balloonUsed: true, usedWaves: true, usedFreeze: true, openedLearn: true, toured: true, changedScenario: true, recorded: true }, quiz: null, ...o });
test('Boba stays quiet for a calm, experienced user', () => { assert.equal(nextRule(ctx(), new Map(), Date.now()), null); });
test('Boba warns about a long wedge first', () => { assert.equal(nextRule(ctx({ site: 'pcw', wedgeSecs: 25 }), new Map(), Date.now())?.id, 'wedge-long'); });
test('Boba explains flow direction when the tip curls', () => {
  assert.equal(nextRule(ctx({ site: 'ra', notice: 'Without the balloon the tip curls in the right atrium.' }), new Map(), Date.now())?.id, 'curl');
});
test('Boba gives no site hints during the quiz', () => {
  assert.equal(nextRule(ctx({ mode: 'quiz', site: null, quiz: { answered: false, secs: 5 } }), new Map(), Date.now()), null);
});
test('every rule, tip and learn section has text', () => {
  for (const r of RULES) assert.ok(r.text(ctx({ wedgeSecs: 30 })).length > 10, r.id);
  assert.ok(GENERAL.every((g) => g.length > 10));
  assert.ok(SECTIONS.every((s) => s.title && s.blocks.length));
  const ids = SECTIONS.flatMap((s) => s.blocks.filter((b) => b.table?.go != null).flatMap((b) => b.table.rows.map((r) => r[b.table.go])));
  for (const id of ids) assert.ok(SCENARIOS.some((s) => s.id === id), id);
});
test('an invalid wedge or uncorrected artefact costs points and explains why', () => {
  const r = scoreRun({ recorded: full, blocked: 0, pullbacks: 0, flushWedged: 1, wedgeMax: 5, secs: 60, flaws: { pcw: 'Under-wedged (catheter too proximal): the wedge you recorded was not valid.' } });
  assert.equal(r.total, 100 - 7 - 5);
  assert.ok(r.notes.some((n) => /Under-wedged/.test(n)) && r.notes.some((n) => /flush/.test(n)));
});
test('Boba names the trace problem in explore but not in the graded case', () => {
  assert.equal(nextRule(ctx({ site: 'ow', balloon: true }), new Map(), Date.now())?.id, 'ow');
  assert.equal(nextRule(ctx({ site: 'pa', artefact: 'whip' }), new Map(), Date.now())?.id, 'whip');
  assert.equal(nextRule(ctx({ mode: 'case', site: 'pa', artefact: 'whip' }), new Map(), Date.now()), null);
  assert.equal(nextRule(ctx({ site: 'ra', notice: 'No RV trace and the depth keeps rising: the catheter is coiling in the right atrium.' }), new Map(), Date.now())?.id, 'coil');
});
