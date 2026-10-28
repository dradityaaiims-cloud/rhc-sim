// Pressure and ECG waveform engine. Pure functions, no rendering (testable in Node).
// Each site's beat is a set of keypoints [time s, pressure mmHg, label?] timed off the ECG,
// joined by a periodic monotone cubic (no overshoot, so peaks and troughs are where the keys are).
// Values are schematic adult textbook numbers for teaching, not measurements.

export const SITES = {
  svc: { name: 'Superior vena cava', short: 'SVC' },
  ivc: { name: 'Inferior vena cava', short: 'IVC' },
  ra: { name: 'Right atrium', short: 'RA' },
  rv: { name: 'Right ventricle', short: 'RV' },
  pa: { name: 'Pulmonary artery', short: 'PA' },
  pcw: { name: 'Pulmonary capillary wedge', short: 'PCW' },
  // balloon up but not a clean wedge: the monitor still labels these PCW; the trace tells the truth
  puw: { name: 'Wedge?', short: 'PCW', real: 'Under-wedged (catheter too proximal)' },
  ow: { name: 'Wedge?', short: 'PCW', real: 'Over-wedged (catheter too distal)' },
};

// atrial: a, c (null = not seen), x, v, y, d (diastasis level), fill (fraction of late diastole to return to d)
// rv: s (systolic), edp, min (early diastolic), plateau (dip-and-plateau); pa: s, d, notch
// Seed values follow ADI's research spec (RHC simulator medical research specification, 2026), which cites
// RHC best-practice reviews, Contemporary PAC Part 1 and the 2022 ESC/ERS guidelines. Means are time averages
// of the generated beat, so they sit close to, not exactly on, the spec's PAd + (PAs − PAd)/3 estimates.
export const SCENARIOS = [
  { id: 'normal', name: 'Normal', hr: 75, co: 5.0, resp: 3, bp: [120, 75], spo2: 97,
    ra: { a: 7, c: 6, x: 4, v: 6, y: 3, d: 5 }, rv: { s: 24, edp: 4, min: 1 },
    pa: { s: 24, d: 10, notch: 14 }, pcw: { a: 9, c: null, x: 6, v: 11, y: 5, d: 7 },
    summary: 'Normal right heart and wedge pressures. RA a wave slightly taller than v; wedge v slightly taller than a.' },
  { id: 'tr', name: 'Severe tricuspid regurgitation', hr: 80, co: 3.0, resp: 3, bp: [108, 68], spo2: 96, coil: 'tv',
    ra: { a: 15, c: null, x: 15, v: 32, y: 7, d: 12 }, rv: { s: 55, edp: 14, min: 8 },
    pa: { s: 50, d: 25, notch: 32 }, pcw: { a: 13, c: null, x: 10, v: 15, y: 9, d: 11 },
    summary: 'The dilated RA often makes the catheter coil on the first float. A tall, broad systolic "cv" wave in the RA (to about 32) with the x descent lost and a steep y descent: the RA trace looks ventricular. Here with pulmonary hypertension. Thermodilution cardiac output is unreliable in severe TR.' },
  { id: 'mr', name: 'Severe mitral regurgitation', hr: 88, co: 4.0, resp: 3, bp: [110, 70], spo2: 95,
    ra: { a: 8, c: 7, x: 4, v: 7, y: 3, d: 5 }, rv: { s: 40, edp: 8, min: 3 },
    pa: { s: 40, d: 24, notch: 28 }, pcw: { a: 15, c: null, x: 11, v: 40, y: 9, d: 12 },
    summary: 'Giant wedge v waves (to about 40) after the T wave, with a raised mean wedge. A big v wave is a clue, not a severity rule: a compliant left atrium can hide it, and a stiff atrium, LV failure or a VSD can produce one without MR.' },
  { id: 'ms', name: 'Mitral stenosis', hr: 90, co: 3.0, resp: 3, bp: [110, 72], spo2: 95,
    ra: { a: 13, c: 12, x: 8, v: 11, y: 7, d: 10 }, rv: { s: 45, edp: 10, min: 4 },
    pa: { s: 45, d: 25, notch: 30 }, pcw: { a: 32, c: null, x: 22, v: 26, y: 21, d: 23, fill: 0.85 },
    summary: 'A high mean wedge with a dominant a wave and a slow y descent (the narrowed valve slows left atrial emptying), with secondary pulmonary hypertension. The transmitral gradient itself needs a simultaneous LV pressure.' },
  { id: 'pah', name: 'Pre-capillary PH (PAH)', hr: 90, co: 3.5, resp: 3, bp: [104, 68], spo2: 93, coil: 'pv',
    ra: { a: 13, c: 10, x: 5, v: 9, y: 5, d: 8 }, rv: { s: 75, edp: 12, min: 4 },
    pa: { s: 75, d: 35, notch: 46 }, pcw: { a: 10, c: null, x: 7, v: 12, y: 6, d: 9 },
    summary: 'High PA and RV systolic pressures with a normal wedge and a high PVR: pre-capillary pulmonary hypertension. Prominent RA a wave from a stiff RV. The dilated RV may make the catheter coil before the pulmonary valve. The RHC defines pre-capillary PH; calling it group 1 PAH needs the full clinical work-up.' },
  { id: 'hf', name: 'Isolated post-capillary PH (left heart failure)', hr: 85, co: 5.0, resp: 3, bp: [108, 70], spo2: 95,
    ra: { a: 8, c: 7, x: 4, v: 7, y: 4, d: 6 }, rv: { s: 42, edp: 10, min: 3 },
    pa: { s: 42, d: 20, notch: 26 }, pcw: { a: 21, c: null, x: 17, v: 25, y: 16, d: 19 },
    summary: 'A high wedge (about 20) with normal wedge morphology, transmitted back to the PA. PVR is normal: isolated post-capillary pulmonary hypertension.' },
  { id: 'rvi', name: 'RV infarction', hr: 70, co: 2.8, resp: 3, bp: [86, 58], spo2: 96,
    ra: { a: 17, c: 16, x: 12, v: 16, y: 11, d: 15 }, rv: { s: 28, edp: 14, min: 5, plateau: true },
    pa: { s: 28, d: 16, notch: 19 }, pcw: { a: 13, c: null, x: 10, v: 14, y: 9, d: 12 },
    summary: 'High RA (about 14) with low-normal PA pressures: RA/PCWP above 0.8 and PAPi below 0.9. The stiff, ischaemic RV gives a sharp early diastolic dip and a rapid rise, with RVEDP close to the wedge.' },
  { id: 'tamponade', name: 'Cardiac tamponade', hr: 115, co: 3.0, resp: 4, bp: [92, 72], spo2: 96,
    ra: { a: 18, c: 17, x: 12, v: 17, y: 16.5, d: 17 }, rv: { s: 30, edp: 16, min: 15 },
    pa: { s: 30, d: 20, notch: 22 }, pcw: { a: 18, c: null, x: 14, v: 18, y: 17, d: 17 },
    summary: 'Raised diastolic pressures that equalise within about 5 mmHg (RA, RVEDP, PA diastolic and wedge all near 16 to 20). The x descent is kept but the y descent is absent, because the ventricles cannot fill in early diastole. Tachycardia; pressures still fall with inspiration.' },
  { id: 'constriction', name: 'Constrictive pericarditis', hr: 95, co: 3.5, resp: 3, bp: [104, 70], spo2: 96, kussmaul: true,
    ra: { a: 20, c: null, x: 10, v: 19, y: 8, d: 19, fill: 0.15 }, rv: { s: 40, edp: 16, min: 3, plateau: true },
    pa: { s: 40, d: 20, notch: 26 }, pcw: { a: 21, c: null, x: 13, v: 22, y: 11, d: 21, fill: 0.15 },
    summary: 'Raised, near-equal diastolic pressures with deep x and very steep y descents (M or W shaped RA), an RV dip and plateau (square root sign) and an RA that rises with inspiration (Kussmaul sign). Telling constriction from restriction needs simultaneous left and right pressures, which this right-heart study cannot show.' },
  { id: 'af', name: 'Atrial fibrillation', hr: 80, co: 4.0, resp: 3, bp: [118, 74], spo2: 97, rhythm: 'af',
    ra: { a: 7, c: 6, x: 4, v: 6, y: 3, d: 5 }, rv: { s: 24, edp: 4, min: 1 },
    pa: { s: 24, d: 10, notch: 14 }, pcw: { a: 9, c: null, x: 6, v: 11, y: 5, d: 7 },
    summary: 'Normal pressures in atrial fibrillation: no a waves in the RA or wedge (no organised atrial contraction), no atrial bump before the RV EDP, and an irregularly irregular rhythm, so the v waves and the PA diastolic vary from beat to beat. Average several beats.' },
  { id: 'asd', name: 'Atrial septal defect (left-to-right shunt)', hr: 78, co: 5.0, resp: 3, bp: [118, 74], spo2: 97, shunt: { level: 'ra', qpqs: 2.0 },
    ra: { a: 7, c: 6, x: 3, v: 7, y: 3, d: 5 }, rv: { s: 32, edp: 6, min: 1 },
    pa: { s: 32, d: 12, notch: 18 }, pcw: { a: 10, c: null, x: 7, v: 11, y: 6, d: 8 },
    summary: 'Near-normal pressures with a mildly raised PA systolic from the extra flow. The saturation run shows a step-up of 7% or more from the venae cavae to the RA, and Qp/Qs is about 2. In a shunt, use pulmonary flow (Qp) for PVR.' },
  { id: 'vsd', name: 'Ventricular septal defect (left-to-right shunt)', hr: 82, co: 5.0, resp: 3, bp: [114, 72], spo2: 97, shunt: { level: 'rv', qpqs: 1.6 },
    ra: { a: 7, c: 6, x: 3, v: 6, y: 3, d: 5 }, rv: { s: 40, edp: 6, min: 1 },
    pa: { s: 40, d: 16, notch: 24 }, pcw: { a: 12, c: null, x: 9, v: 15, y: 8, d: 10 },
    summary: 'RA saturation matches the cavae, then a step-up of 5% or more in the RV and PA. PA pressure is raised by the shunt flow and the left atrium is volume loaded (higher wedge v wave). Qp/Qs about 1.6.' },
  { id: 'hypovolemia', name: 'Hypovolaemia', hr: 110, co: 4.5, resp: 3, bp: [90, 58], spo2: 98,
    ra: { a: 2, c: 1.5, x: 0, v: 2, y: 0, d: 1 }, rv: { s: 16, edp: 1, min: 0 },
    pa: { s: 16, d: 4, notch: 7 }, pcw: { a: 4, c: null, x: 2, v: 4, y: 1, d: 3 },
    summary: 'Low filling pressures throughout (RA about 1, wedge about 3) with a compensatory tachycardia.' },
];
// shared physiology for oximetry, Fick and vitals (an average adult)
export const PHYS = { hb: 14, bsa: 1.9, vo2: 240, pvSat: 98 };
export const scenario = (id) => SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];

/** ECG-referenced event times (s from P-wave onset) for a heart rate. */
export function timing(hr) {
  const RR = 60 / hr, tR = 0.18, QT = 0.4 * Math.sqrt(RR); // QTc 0.40 s (Bazett)
  const sEnd = tR + QT; // end of ejection at the end of the T wave, so the dicrotic notch and v waves fall after it
  return { RR, tP: 0.06, tA: 0.14, tR, QT, sEnd, dia: RR - sEnd };
}

function atrialKeys(w, T, af) {
  const tC = T.tR + 0.04, tX = T.tR + 0.6 * (T.sEnd - T.tR), tV = T.sEnd + 0.08 * T.dia, tY = T.sEnd + 0.4 * T.dia;
  // AF: no atrial contraction, so no a wave and a shallower x descent (no atrial relaxation)
  const x = af ? (w.x + w.d) / 2 : w.x;
  const k = af ? [[T.tA - 0.06, w.d]] : [[T.tA - 0.06, w.d], [T.tA, w.a, 'a']];
  if (w.c != null) k.push([(T.tA + tC) / 2, w.c - 1.5], [tC, w.c, 'c']);
  k.push([tX, x, 'x'], [tV, w.v, 'v'], [tY, w.y, 'y'], [tY + (w.fill ?? 0.45) * (T.RR - tY), w.d]);
  return k;
}
function rvKeys(w, T, af) {
  // compliant RV: nearly flat diastole, a small a-wave bump (none in AF), EDP read just before the QRS
  const pre = w.plateau ? w.edp : w.edp - (af ? 0.5 : 1.5), fill = w.plateau ? w.edp : pre - 0.5;
  return [[T.tA - 0.06, pre], ...(af ? [] : [[T.tA + 0.04, w.edp + 0.5]]), [T.tR - 0.01, w.edp, 'EDP'], [T.tR + 0.03, w.edp + 1],
    [T.tR + 0.45 * (T.sEnd - T.tR), w.s], [T.sEnd - 0.03, 0.85 * w.s], [T.sEnd + 0.3 * T.dia, w.min, w.plateau ? 'dip' : undefined], [T.sEnd + 0.55 * T.dia, fill]];
}
function paKeys(w, T) {
  return [[T.tR + 0.05, w.d], [T.tR + 0.45 * (T.sEnd - T.tR) + 0.01, w.s],
    [T.sEnd, w.notch, 'notch'], [T.sEnd + 0.25 * T.dia, w.notch + 1.5]];
}

// periodic monotone cubic Hermite (Fritsch-Butland slopes) through keys sorted by time in [0, RR)
function makeSpline(keys, RR) {
  const k = keys.map(([t, p]) => [((t % RR) + RR) % RR, p]).sort((a, b) => a[0] - b[0]);
  const ts = [k.at(-1)[0] - RR, ...k.map((x) => x[0]), k[0][0] + RR, k[1][0] + RR];
  const ps = [k.at(-1)[1], ...k.map((x) => x[1]), k[0][1], k[1][1]];
  const n = ts.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ps[i + 1] - ps[i]) / (ts[i + 1] - ts[i]));
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const h0 = ts[i] - ts[i - 1], h1 = ts[i + 1] - ts[i];
    m[i] = 3 * (h0 + h1) / ((2 * h1 + h0) / d[i - 1] + (h1 + 2 * h0) / d[i]);
  }
  return (t) => {
    t = ((t % RR) + RR) % RR;
    let i = 1; while (i < n - 2 && t >= ts[i + 1]) i++;
    if (t < ts[i]) i = 0;
    const h = ts[i + 1] - ts[i], u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ps[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ps[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}

const WEDGE_DELAY = 0.1; // s: the LA waves reach the wedged tip late and damped
const cache = new Map();
/** One beat's curve for a site. RR (s) defaults to the scenario's rate; AF beats each get their own RR. */
function curve(sc, site, RR = 60 / sc.hr, af = isAF(sc)) {
  RR = Math.round(RR * 100) / 100; // quantised so irregular beats share curves
  const id = `${sc.id}:${site}:${RR}:${af}`;
  if (cache.has(id)) return cache.get(id);
  const T = timing(60 / RR);
  const keys = site === 'rv' ? rvKeys(sc.rv, T, af) : site === 'pa' ? paKeys(sc.pa, T)
    : site === 'pcw' ? atrialKeys(sc.pcw, T, af).map(([t, p, l]) => [t + WEDGE_DELAY, p, l]) : atrialKeys(sc.ra, T, af);
  const f = makeSpline(keys, T.RR);
  let mean = 0; for (let i = 0; i < 400; i++) mean += f((i / 400) * T.RR) / 400;
  // the cavae show a damped RA trace (no valve between them and the RA)
  const damp = site === 'svc' || site === 'ivc' ? 0.75 : 1;
  const c = { T, keys, mean, f: damp === 1 ? f : (t) => mean + damp * (f(t) - mean) };
  cache.set(id, c);
  return c;
}

export const isAF = (sc, opts = {}) => opts.af ?? sc.rhythm === 'af';

// AF beat schedule: an irregularly irregular RR sequence, reproducible per scenario (seeded)
const schedules = new Map();
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** {start, RR, prevRR} of the beat containing t. Sinus: a fixed RR. */
export function beatAt(sc, t, af = isAF(sc)) {
  const mean = 60 / sc.hr;
  if (!af) { const n = Math.floor(t / mean); return { n, start: n * mean, RR: mean, prevRR: mean }; }
  let S = schedules.get(sc.id);
  if (!S) { S = { starts: [0], rr: [], rand: rng([...sc.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) }; schedules.set(sc.id, S); }
  if (t < 0) t = 0;
  while (S.starts.at(-1) <= t) { const r = mean * (0.65 + 0.7 * S.rand()); S.rr.push(r); S.starts.push(S.starts.at(-1) + r); }
  let lo = 0, hi = S.rr.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S.starts[m] <= t) lo = m; else hi = m - 1; }
  return { n: lo, start: S.starts[lo], RR: S.rr[lo], prevRR: S.rr[lo - 1] ?? mean };
}

/** 0 at end-expiration, 1 at peak spontaneous inspiration. */
export const inspiration = (t, period = 4.5) => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period);

/** Pressure (mmHg) at `site` at time t (s). Spontaneous inspiration lowers intrathoracic pressure,
 *  except the RA and cavae in constriction (Kussmaul sign); a positive-pressure breath raises it.
 *  Either way the end-expiratory value is what measure() reports. */
export function pressureAt(sc, site, t, { resp = true, vent = false, af = isAF(sc), owSecs = 0, ectopic = null } = {}) {
  let p;
  if (site === 'puw') p = 0.5 * (pressureAt(sc, 'pa', t, { resp: false, af }) + pressureAt(sc, 'pcw', t, { resp: false, af })); // partial occlusion: PA and wedge mixed
  else if (site === 'ow') { // over-wedge: tip against the wall, pressure climbs with no a or v waves
    const base = curve(sc, 'pcw').mean, top = sc.pa.s + 5;
    p = base + (top - base) * (1 - Math.exp(-owSecs / 3)) + 0.4 * Math.sin(2 * Math.PI * 1.7 * t);
  } else if (!af) p = curve(sc, site).f(t);
  else {
    // each AF beat uses its own RR; ease out the step between beats over 80 ms
    const b = beatAt(sc, t, true), ph = t - b.start, c = curve(sc, site, b.RR, true), prev = curve(sc, site, b.prevRR, true);
    const k = Math.min(1, ph / 0.08), ease = 1 - k * k * (3 - 2 * k);
    p = c.f(ph) + (prev.f(-1e-3) - c.f(0)) * ease;
  }
  if (ectopic && (site === 'rv' || site === 'pa')) { // a PVC ejects less: a smaller pulse that beat
    const b = beatAt(sc, t, af);
    if (ectopic.has(b.n)) { const base = pressureAt(sc, site, b.start, { resp: false, af }); p = base + (p - base) * 0.65; }
  }
  if (resp && sc.resp) p += (vent || (sc.kussmaul && ['ra', 'svc', 'ivc'].includes(site)) ? 1 : -1) * sc.resp * inspiration(t);
  return p;
}

const g = (t, mu, s) => Math.exp(-0.5 * ((t - mu) / s) ** 2);
// one beat's ECG at time x after the beat start; a PVC is wide and bizarre with no P wave and a discordant T
function beatEcg(x, T, pvc, af) {
  if (pvc) return 1.3 * g(x, T.tR + 0.01, 0.028) - 0.7 * g(x, T.tR + 0.075, 0.03) - 0.45 * g(x, T.tR + T.QT - 0.04, 0.07);
  return (af ? 0 : 0.15 * g(x, T.tP, 0.022)) - 0.1 * g(x, T.tR - 0.022, 0.007) + 1.1 * g(x, T.tR, 0.009)
    - 0.25 * g(x, T.tR + 0.024, 0.009) + 0.3 * g(x, T.tR + T.QT - 0.1, 0.045);
}
/** Lead II-like ECG (mV). AF: fibrillatory baseline, no P waves. `ectopic`: beat numbers that are PVCs. */
export function ecgAt(sc, t, { af = isAF(sc), ectopic = null } = {}) {
  const b = beatAt(sc, t, af), T = timing(sc.hr), ph = t - b.start, pvc = (n) => !!ectopic?.has(n);
  let v = af ? 0.035 * Math.sin(2 * Math.PI * 5.3 * t) + 0.025 * Math.sin(2 * Math.PI * 7.1 * t + 1) : 0;
  v += beatEcg(ph, T, pvc(b.n), af) + beatEcg(ph + b.prevRR, T, pvc(b.n - 1), af);
  if (!af) v += beatEcg(ph - b.RR, T, pvc(b.n + 1), af);
  return v;
}

/** Wave labels (a, c, v, x, y, EDP, notch...) whose time falls in (t0, t1]. */
export function labelsIn(sc, site, t0, t1, { af = isAF(sc) } = {}) {
  const out = [];
  if (!curveSites.includes(site) || site === 'svc' || site === 'ivc') return out;
  if (af) {
    for (let b = beatAt(sc, Math.max(0, t0 - 0.3), true); b.start <= t1; b = beatAt(sc, b.start + b.RR + 1e-6, true)) {
      for (const [kt, , label] of curve(sc, site, b.RR, true).keys) {
        const t = b.start + kt;
        if (label && t > t0 && t <= t1) out.push({ t, label });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }
  const c = curve(sc, site), RR = c.T.RR;
  for (const [kt, , label] of c.keys) {
    if (!label) continue;
    for (let n = Math.floor(t0 / RR) - 1; n <= Math.floor(t1 / RR) + 1; n++) {
      const t = kt + n * RR;
      if (t > t0 && t <= t1) out.push({ t, label });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

const curveSites = ['svc', 'ivc', 'ra', 'rv', 'pa', 'pcw'];

/** End-expiratory readings, the way they are reported: rounded mmHg. AF: the beat at the mean rate. */
export function measure(sc, site, { af = isAF(sc) } = {}) {
  if (!curveSites.includes(site)) { // puw / ow: sample the trace (over-wedge as it looks after 10 s)
    const RR = 60 / sc.hr, ps = Array.from({ length: 300 }, (_, i) => pressureAt(sc, site, (i / 300) * RR, { resp: false, af: false, owSecs: 10 }));
    const r = Math.round;
    return { site, sys: r(Math.max(...ps)), dia: r(Math.min(...ps)), mean: r(ps.reduce((a, b) => a + b) / ps.length), generic: true };
  }
  const c = curve(sc, site, undefined, af), N = 600;
  let max = -Infinity, min = Infinity;
  for (let i = 0; i < N; i++) { const p = c.f((i / N) * c.T.RR); max = Math.max(max, p); min = Math.min(min, p); }
  const r = Math.round, m = { site, sys: r(max), dia: r(min), mean: r(c.mean) };
  if (site === 'rv') m.edp = r(c.f(c.T.tR - 0.01));
  if (site === 'pcw') m.ed = r(c.f(c.T.tR + 0.03 + WEDGE_DELAY)); // end-diastolic wedge (after a, before c): the better LVEDP estimate
  if (['ra', 'pcw', 'svc', 'ivc'].includes(site)) {
    const at = (l) => c.keys.find((k) => k[2] === l);
    m.a = at('a') ? r(c.f(at('a')[0])) : null; m.v = r(c.f(at('v')[0]));
  }
  return m;
}

/** Text for a reading, e.g. "25/10 (15)" for the PA. */
export function formatReading(m) {
  if (m.generic) return `${m.sys}/${m.dia} (mean ${m.mean})${m.artefact ? ' ⚠' : ''}`;
  if (m.site === 'rv') return `${m.sys}/${m.edp} (EDP)`;
  if (m.site === 'pa') return `${m.sys}/${m.dia} (mean ${m.mean})`;
  return `${m.a != null ? `a ${m.a}, ` : 'no a, '}v ${m.v}, mean ${m.mean}${m.ed != null ? `, ED ${m.ed}` : ''}`;
}

/** Derived haemodynamics from recorded readings. PVR in Wood units. */
export function derive({ pa, pcw, ra }, co) {
  if (!pa || !pcw || !co) return null;
  const tpg = pa.mean - pcw.mean, pvr = Math.round((tpg / co) * 10) / 10;
  const papi = ra?.mean > 0 ? Math.round(((pa.sys - pa.dia) / ra.mean) * 100) / 100 : null;
  return { mpap: pa.mean, pcwp: pcw.mean, rap: ra?.mean, tpg, dpg: pa.dia - pcw.mean, pvr, co, papi, ph: classifyPH(pa.mean, pcw.mean, pvr) };
}

/** 2022 ESC/ERS haemodynamic definitions. */
export function classifyPH(mpap, pcwp, pvr) {
  if (mpap <= 20) return 'No pulmonary hypertension (mPAP ≤ 20)';
  if (pcwp <= 15) return pvr > 2 ? 'Pre-capillary PH (PCWP ≤ 15, PVR > 2)' : 'Unclassified PH (mPAP > 20, PCWP ≤ 15, PVR ≤ 2)';
  return pvr > 2 ? 'Combined post- and pre-capillary PH (PCWP > 15, PVR > 2)' : 'Isolated post-capillary PH (PCWP > 15, PVR ≤ 2)';
}

/** Seconds since ejection began in the current beat (negative before it). Drives catheter whip. */
export function systoleAge(sc, t, opts = {}) {
  const b = beatAt(sc, t, isAF(sc, opts)), T = timing(60 / b.RR);
  return t - b.start - (T.tR + 0.05);
}

/** A fixed vertical scale for the whole case, as on a cath-lab monitor. */
export const scaleFor = (sc) => { const top = Math.max(sc.rv.s, sc.pa.s, sc.pcw.v) + 4; return [40, 60, 80, 100].find((s) => s >= top) ?? 120; };
