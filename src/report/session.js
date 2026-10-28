// Everything the procedure produced, for the report: a down-sampled waveform record and time-stamped events.
// Pure (no DOM); times are simulation seconds from the start of the case.
export const KEEP_SECS = 20 * 60; // shortcut: keeps the last 20 minutes; enough for one case

export class Session {
  constructor() { this.reset(); }
  reset(startedAt = new Date()) { this.startedAt = startedAt; this.t0 = null; this.samples = []; this.events = []; }
  /** sample = {t, ecg, p, site}; keeps every second sample (125 Hz is plenty for a printed strip) */
  push(s) {
    if (this.t0 === null) this.t0 = s.t;
    if ((this.n = (this.n ?? 0) + 1) % 2) return;
    this.samples.push({ t: s.t - this.t0, ecg: s.ecg, p: s.p, site: s.site });
    while (this.samples.length && this.samples[0].t < this.samples.at(-1).t - KEEP_SECS) this.samples.shift();
  }
  /** kind: 'site' | 'balloon' | 'record' | 'note' | 'case' | 'monitor' */
  event(t, kind, text) {
    if (this.t0 === null) this.t0 = t;
    const e = { t: Math.max(0, t - this.t0), kind, text };
    if (this.events.at(-1)?.text !== text || e.t - this.events.at(-1).t > 3) this.events.push(e);
    return e;
  }
  window(t0, t1) { return this.samples.filter((s) => s.t >= t0 && s.t <= t1); }
  get duration() { return this.samples.at(-1)?.t ?? 0; }
}

/** 75.4 -> "01:15" */
export const clock = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Strip windows (s): one around each site change and each recording, merged when they overlap. */
export function stripWindows(events, duration, len = 8, before = 2, max = 24) {
  const out = [];
  for (const e of events.filter((x) => x.kind === 'site' || x.kind === 'record')) {
    const a = Math.max(0, Math.min(e.t - before, duration - len)), b = a + len;
    if (out.length && a < out.at(-1)[1] - 1) continue;
    out.push([a, b]);
  }
  return out.slice(-max);
}
