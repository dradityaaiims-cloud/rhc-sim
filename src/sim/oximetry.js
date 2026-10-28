// Oxygen saturations, Fick and thermodilution cardiac output, shunt ratios and vitals. Pure functions.
// Saturations are built to be consistent with each scenario's cardiac output by the Fick principle.
import { PHYS } from './hemo.js';

const O2 = (sat) => 1.34 * PHYS.hb * (sat / 100); // mL O2 per dL (dissolved O2 ignored)

/** Mixed venous saturation (%) that the scenario's systemic output implies: SvO2 = SaO2 - VO2 / (10 x CO x 1.34 x Hb). */
export const mixedVenous = (sc) => sc.spo2 - (PHYS.vo2 / (10 * sc.co * 1.34 * PHYS.hb)) * 100;

/** Saturation (%) of a blood sample drawn at a site. The SVC is a little lower than the IVC; a left-to-right
 *  shunt raises everything from the shunt level on; a true wedge returns pulmonary venous blood. */
export function satAt(sc, site) {
  const mv = mixedVenous(sc), r1 = (x) => Math.round(x * 10) / 10;
  const shunt = sc.shunt, pv = PHYS.pvSat;
  // with a shunt, PA saturation follows from Qp/Qs: (SaO2 - MV) / (PV - PA) = Qp/Qs
  const pa = shunt ? pv - (sc.spo2 - mv) / shunt.qpqs : mv;
  const after = (lvl) => shunt && (shunt.level === 'ra' || (shunt.level === 'rv' && lvl !== 'ra'));
  switch (site) {
    case 'svc': return r1(mv - 1.5);
    case 'ivc': return r1(mv + 4.5);
    case 'ra': return r1(after('ra') ? pa : mv);
    case 'rv': return r1(after('rv') ? pa : mv);
    case 'pa': return r1(pa);
    case 'pcw': return r1(pv - 0.5);
    case 'puw': return r1((pa + pv) / 2); // partly pulmonary arterial blood: under 88% suggests an under-wedge
    case 'ow': return null;                // nothing aspirates from a jammed tip
    default: return null;
  }
}

/** Fick: systemic flow from VO2 and the arterial and mixed venous (pre-shunt) saturations; Qp from PV and PA. */
export function fick(sc, sats) {
  // mixed venous (pre-shunt): Flamm from both cavae; else the SVC when there is a step-up (the PA is shunt-contaminated); else the PA
  const mvSat = sats.svc != null && sats.ivc != null ? (3 * sats.svc + sats.ivc) / 4
    : sats.svc != null && (sats.pa == null || stepUps(sats).length) ? sats.svc : sats.pa;
  if (mvSat == null) return null;
  const qs = PHYS.vo2 / (10 * (O2(sc.spo2) - O2(mvSat)));
  const out = { mvSat: Math.round(mvSat * 10) / 10, qs: Math.round(qs * 100) / 100, ci: Math.round((qs / PHYS.bsa) * 100) / 100 };
  if (sats.pa != null) {
    const qp = PHYS.vo2 / (10 * (O2(PHYS.pvSat) - O2(sats.pa)));
    out.qp = Math.round(qp * 100) / 100; out.qpqs = Math.round((qp / qs) * 100) / 100;
  }
  return out;
}

/** Step-ups in a saturation run: ≥7% at the atrial level (vs the cavae), ≥5% at the RV or PA level. */
export function stepUps(sats) {
  const out = [], cav = sats.svc ?? sats.ivc;
  if (cav != null && sats.ra != null && sats.ra - cav >= 7) out.push('atrial');
  if (sats.ra != null && sats.rv != null && sats.rv - sats.ra >= 5) out.push('ventricular');
  if (sats.rv != null && sats.pa != null && sats.pa - sats.rv >= 5) out.push('pulmonary artery');
  return out;
}

/** Thermodilution: a gamma-variate cooling curve; CO = K / area (Stewart-Hamilton). `rand` gives the
 *  injection-to-injection scatter; severe TR and shunts make the method unreliable (recirculation, slow washout). */
export function thermodilution(sc, rand = Math.random) {
  const trueFlow = sc.shunt ? sc.co * sc.shunt.qpqs : sc.co; // the PA thermistor sees pulmonary flow
  const unreliable = sc.id === 'tr' || !!sc.shunt;
  const co = trueFlow * (1 + (rand() - 0.5) * (unreliable ? 0.5 : 0.1));
  const tp = 1.4 * Math.sqrt(5 / co) * (sc.id === 'tr' ? 1.8 : 1), alpha = 3, K = 10;
  const shape = (t) => (t <= 0 ? 0 : (t / tp) ** alpha * Math.exp(alpha * (1 - t / tp)));
  let area = 0; const dt = 0.05, pts = [];
  for (let t = 0; t <= 12; t += dt) { const v = shape(t) + (sc.shunt ? 0.25 * shape(t - 4) : 0); pts.push([t, v]); area += v * dt; }
  const scale = K / co / area; // so that K / (scaled area) = co
  return { co: Math.round(co * 100) / 100, curve: pts.map(([t, v]) => [t, v * scale]), unreliable };
}

/** Accept a thermodilution series: at least three, all within 10% of their mean. */
export function acceptTD(values) {
  if (values.length < 3) return { ok: false, mean: null };
  const last = values.slice(-3), mean = last.reduce((a, b) => a + b) / 3;
  return { ok: last.every((v) => Math.abs(v - mean) / mean <= 0.1), mean: Math.round(mean * 100) / 100 };
}

/** Vitals and systemic numbers. MAP = DBP + (SBP - DBP) / 3. SVR in Wood units and dyn·s·cm⁻⁵. */
export function vitals(sc, rap) {
  const [sbp, dbp] = sc.bp, map = Math.round(dbp + (sbp - dbp) / 3);
  const svrWU = rap != null ? Math.round(((map - rap) / sc.co) * 10) / 10 : null;
  return { sbp, dbp, map, spo2: sc.spo2, ci: Math.round((sc.co / PHYS.bsa) * 100) / 100, svrWU, svr: svrWU != null ? Math.round(svrWU * 80) : null };
}
