// Pure scoring and question helpers for the modes (testable in Node).
import { SCENARIOS } from '../sim/hemo.js';

export const RECORD_SITES = ['ra', 'rv', 'pa', 'pcw'];
export const WEDGE_LIMIT = 18; // s: about 4 breaths at 4.5 s each

/** run = {recorded: {site: reading}, blocked, pullbacks, flushWedged, wedgeMax (s), secs, flaws, prep (0..1),
 *  coMeasured, diagnosis?: bool} -> {total, parts, notes}. Recordings 40, preparation 10, cardiac output 10,
 *  safety 20, technique 10, time 10; in the game the diagnosis is 20 of 100. */
export function scoreRun(run) {
  const n = RECORD_SITES.filter((s) => run.recorded[s]).length, flaws = Object.keys(run.flaws ?? {}).length;
  const parts = {
    readings: Math.max(0, n * 10 - 5 * flaws),
    prep: Math.round((run.prep ?? 1) * 10),
    output: run.coMeasured === false ? 0 : 10,
    safety: Math.max(0, 20 - 5 * run.pullbacks - 5 * (run.flushWedged ?? 0) - (run.wedgeMax > 30 ? 10 : run.wedgeMax > WEDGE_LIMIT ? 5 : 0)),
    technique: Math.max(0, 10 - 2 * run.blocked),
    time: run.secs <= 180 ? 10 : run.secs <= 360 ? 5 : 0,
  };
  let total = Object.values(parts).reduce((a, b) => a + b, 0);
  if (run.diagnosis !== undefined) { parts.diagnosis = run.diagnosis ? 20 : 0; total = Math.round(total * 0.8) + parts.diagnosis; }
  const notes = [];
  if (n < 4) notes.push(`Record all four sites (${RECORD_SITES.filter((s) => !run.recorded[s]).map((s) => s.toUpperCase()).join(', ')} missing).`);
  if ((run.prep ?? 1) < 1) notes.push('Complete the pre-procedure checklist: time-out, monitoring, flushing, balloon test, and zeroing and levelling the transducer.');
  if (run.coMeasured === false) notes.push('Measure the cardiac output: three thermodilution injections within 10%, or a Fick output from the mixed venous saturation. Without it there is no PVR.');
  if (run.pullbacks) notes.push('Always deflate the balloon before withdrawing through a valve: an inflated balloon can tear the valve leaflets or chordae.');
  if (run.wedgeMax > WEDGE_LIMIT) notes.push(`You stayed wedged for ${Math.round(run.wedgeMax)} s. Record the PCWP and deflate within about 4 breaths: a prolonged wedge risks pulmonary infarction and PA rupture.`);
  for (const f of Object.values(run.flaws ?? {})) notes.push(f);
  if (run.flushWedged) notes.push('Never flush while wedged: deflate the balloon first.');
  if (run.blocked) notes.push('Inflate the balloon in the RA before advancing: the catheter is flow-directed and floats across the valves with the balloon up.');
  if (!notes.length) notes.push('Clean, safe run: checklist done, transducer zeroed and level, all sites recorded, output measured and a short wedge.');
  return { total, parts, notes };
}

/** A diagnosis question: the hidden scenario plus three distractors, shuffled. */
export function diagnosisOptions(answerId, rand = Math.random) {
  const others = SCENARIOS.filter((s) => s.id !== answerId).map((s) => s.id).sort(() => rand() - 0.5).slice(0, 3);
  return [answerId, ...others].sort(() => rand() - 0.5);
}

/** "Name that waveform": a random site and scenario. */
export function waveformQuestion(rand = Math.random) {
  const site = RECORD_SITES[Math.floor(rand() * RECORD_SITES.length)];
  const sc = SCENARIOS[Math.floor(rand() * SCENARIOS.length)];
  return { site, scenarioId: sc.id, options: RECORD_SITES };
}
