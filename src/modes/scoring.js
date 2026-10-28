// Pure scoring and question helpers for the modes (testable in Node).
import { SCENARIOS } from '../sim/hemo.js';

export const RECORD_SITES = ['ra', 'rv', 'pa', 'pcw'];
export const WEDGE_LIMIT = 18; // s: about 4 breaths at 4.5 s each

/** run = {recorded: {site: reading}, blocked, pullbacks, wedgeMax (s), secs, diagnosis?: bool} -> {total, parts, notes} */
export function scoreRun(run) {
  const n = RECORD_SITES.filter((s) => run.recorded[s]).length;
  const parts = {
    safety: Math.max(0, 20 - 5 * run.pullbacks - 5 * (run.flushWedged ?? 0) - (run.wedgeMax > 30 ? 10 : run.wedgeMax > WEDGE_LIMIT ? 5 : 0)),
    technique: Math.max(0, 10 - 2 * run.blocked),
    readings: n * 15 - 7 * Object.keys(run.flaws ?? {}).length,
    time: run.secs <= 120 ? 10 : run.secs <= 240 ? 5 : 0,
  };
  let total = parts.readings + parts.safety + parts.technique + parts.time;
  if (run.diagnosis !== undefined) { parts.diagnosis = run.diagnosis ? 20 : 0; total = Math.round(total * 0.8) + parts.diagnosis; }
  const notes = [];
  if (n < 4) notes.push(`Record all four sites (${RECORD_SITES.filter((s) => !run.recorded[s]).map((s) => s.toUpperCase()).join(', ')} missing).`);
  if (run.pullbacks) notes.push('Always deflate the balloon before withdrawing through a valve: an inflated balloon can tear the valve leaflets or chordae.');
  if (run.wedgeMax > WEDGE_LIMIT) notes.push(`You stayed wedged for ${Math.round(run.wedgeMax)} s. Record the PCWP and deflate within about 4 breaths: a prolonged wedge risks pulmonary infarction and PA rupture.`);
  for (const f of Object.values(run.flaws ?? {})) notes.push(f);
  if (run.flushWedged) notes.push('Never flush while wedged: deflate the balloon first.');
  if (run.blocked) notes.push('Inflate the balloon in the RA before advancing: the catheter is flow-directed and floats across the valves with the balloon up.');
  if (!notes.length) notes.push('Clean, safe run: all sites recorded, balloon handled correctly and a short wedge.');
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
