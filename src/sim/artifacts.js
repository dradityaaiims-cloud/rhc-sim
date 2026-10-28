// Monitoring artefacts applied to the true tip pressure before it reaches the monitor. Pure logic.
// Overdamping: first-order low-pass (bubble, clot, kink, tip against the wall).
// Underdamping: a resonant second-order line (long tubing, small bubble) that rings and overshoots.
// Catheter whip: a decaying oscillation on each systolic upstroke while the tip is in the PA or RV.
import { pressureAt, systoleAge } from './hemo.js';

export const ARTEFACTS = {
  none: { name: 'None' },
  whip: { name: 'Catheter whip', fix: 'Reposition the catheter 1 to 2 cm (advance or withdraw).',
    clue: 'Sharp systolic spikes and overshoot in the PA: the systolic reading is falsely high.' },
  over: { name: 'Overdamped', fix: 'Flush the line (X) to clear bubbles or clot; check for kinks.',
    clue: 'Blunted, rounded peaks, the dicrotic notch lost, systolic too low and diastolic too high. The mean is about right.' },
  under: { name: 'Underdamped', fix: 'Flush to remove small bubbles and use shorter, stiffer tubing (X here).',
    clue: 'Ringing and overshoot after each upstroke: systolic too high and diastolic too low.' },
};

export class Transducer {
  constructor(kind = 'none') { this.set(kind); }
  set(kind) { this.kind = kind; this.y = null; this.v = 0; }
  /** p: true pressure; dt: sample step (s); age: seconds since ejection began; site: tip site */
  step(p, dt, age = -1, site = '') {
    if (this.y === null) this.y = p;
    if (this.kind === 'over') this.y += (p - this.y) * Math.min(1, dt / 0.12);
    else if (this.kind === 'under') { // semi-implicit Euler: natural frequency 5 Hz, damping ratio 0.08
      const wn = 2 * Math.PI * 5, z = 0.08;
      this.v += (wn * wn * (p - this.y) - 2 * z * wn * this.v) * dt;
      this.y += this.v * dt;
    } else this.y = p;
    let out = this.y;
    if (this.kind === 'whip' && (site === 'pa' || site === 'rv') && age > 0) out += 10 * Math.sin(2 * Math.PI * 12 * age) * Math.exp(-age / 0.18);
    return out;
  }
}

/** What the monitor would read at this site with this artefact: one beat after the line settles. */
export function measureWith(sc, site, kind, opts = {}) {
  const tr = new Transducer(kind), dt = 1 / 250, RR = 60 / sc.hr, ps = [];
  for (let t = 0; t < 3 * RR; t += dt) {
    const y = tr.step(pressureAt(sc, site, t, { ...opts, resp: false, af: false }), dt, systoleAge(sc, t, { af: false }), site);
    if (t >= 2 * RR) ps.push(y);
  }
  const r = Math.round;
  return { site, sys: r(Math.max(...ps)), dia: r(Math.min(...ps)), mean: r(ps.reduce((a, b) => a + b) / ps.length), generic: true, artefact: kind };
}
