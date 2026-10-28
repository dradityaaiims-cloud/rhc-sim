import { PATH } from '../anatomy/heartModel.js';
// Balloon-tipped (Swan-Ganz style) catheter on a fixed path through the right heart.
// Pure logic, no rendering. Units: cm. Patient frame: x = patient left, y = superior, z = anterior,
// origin near the centre of the heart.

// Waypoints come from the NIH Human Reference Atlas heart (tools/build-heart.mjs): each point's `site`
// is the chamber of the path from that point to the next; marks: ra (RA entry), tv, pv, wz (wedge zone).
const DOWNSTREAM = PATH.downstream;
export const ACCESS = {
  rij: { name: 'Right internal jugular', offset: 0, start: 'svc', pts: PATH.rij },
  fem: { name: 'Right femoral vein', offset: 0, start: 'ivc', pts: PATH.fem },
};

const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), mul = (a, k) => a.map((v) => v * k);
const len = (a) => Math.hypot(...a);

/** Catmull-Rom densified polyline; every dense point keeps its source segment's site. */
export function buildPath(access) {
  const W = [...ACCESS[access].pts, ...DOWNSTREAM];
  const pts = [], cum = [0], marks = {};
  for (let i = 0; i < W.length - 1; i++) {
    const p0 = W[Math.max(0, i - 1)].p, p1 = W[i].p, p2 = W[i + 1].p, p3 = W[Math.min(W.length - 1, i + 2)].p;
    if (W[i].mark) marks[W[i].mark] = pts.length;
    for (let j = 0; j < 12; j++) {
      const t = j / 12, t2 = t * t, t3 = t2 * t;
      const p = mul(add(add(mul(p1, 2), mul(sub(p2, p0), t)), add(mul(add(sub(mul(p0, 2), mul(p1, 5)), sub(mul(p2, 4), p3)), t2), mul(add(sub(mul(p1, 3), p0), sub(p3, mul(p2, 3))), t3))), 0.5);
      if (pts.length) cum.push(cum.at(-1) + len(sub(p, pts.at(-1).p)));
      pts.push({ p, site: W[i].site });
    }
  }
  const last = W.at(-1);
  cum.push(cum.at(-1) + len(sub(last.p, pts.at(-1).p))); pts.push({ p: last.p, site: last.site });
  const at = (m) => cum[marks[m]];
  return { pts, cum, total: cum.at(-1), raEntry: at('ra'), tv: at('tv'), pv: at('pv'), wedgeZone: at('wz'), offset: ACCESS[access].offset };
}

export const BALLOON_ML = 1.5;
export const DEPTH_SCALE = 1; // real anatomy: path cm are body cm
export const MIN_INFLATE_DEPTH = 15; // cm: inflate only once the tip is beyond the introducer sheath

export const MAX_SLACK = 25;      // cm of catheter that can loop up in a chamber
const PUW = 1.0, OW = 0.8, CAP = 1.6; // cm around the wedge zone: under-wedge before it, over-wedge past OW, stop at CAP

export class Catheter {
  constructor(access = 'rij') { this.coilGate = null; this.reset(access); }

  reset(access = this.access) {
    this.access = access;
    this.path = buildPath(access);
    this.s = 1;              // cm along the path from the sheath
    this.slack = 0;          // cm coiled up behind the tip (adds to depth, not to position)
    this.balloon = false;
    this.notice = null;      // last teaching message from a blocked move
    this.wedgeSecs = 0; this.owSecs = 0;
    this.coilArmed = !!this.coilGate; this.coiled = false;
    this.artefact = 'none'; this.artefactAt = this.s;
  }

  /** Scenario anatomy: 'tv' = dilated RA (coils before the tricuspid on the first float), 'pv' = dilated RV. */
  setCoil(gate) { this.coilGate = gate || null; this.coilArmed = !!gate; }

  /** Where the tip is reading. With the balloon up in the distal branch: under-wedge, wedge or over-wedge. */
  get site() {
    const P = this.path, wz = P.wedgeZone;
    if (this.balloon && this.s >= wz - PUW) return this.s < wz ? 'puw' : this.s <= wz + OW ? 'pcw' : 'ow';
    if (this.s >= P.pv) return 'pa';
    if (this.s >= P.tv) return 'rv';
    if (this.s >= P.raEntry) return 'ra';
    return ACCESS[this.access].start;
  }
  get wedged() { return this.site === 'pcw'; }
  get depth() { return Math.round(this.path.offset + DEPTH_SCALE * this.s + this.slack); }

  /** Move the tip by ds cm (negative = withdraw). Returns the notice if the move was limited. */
  advance(ds) {
    const P = this.path, s0 = this.s, wz = P.wedgeZone;
    this.notice = null;
    if (ds < 0 && this.slack > 0) { const take = Math.min(this.slack, -ds); this.slack -= take; ds += take; } // pulling back first takes up the loop
    let s = Math.min(P.total - 0.3, Math.max(0.5, s0 + ds));
    if (ds > 0) {
      const gate = s0 < P.tv && s >= P.tv ? 'tv' : s0 < P.pv && s >= P.pv ? 'pv' : null;
      const coil = gate && (!this.balloon || (this.coilArmed && this.coilGate === gate));
      if (coil) {
        // the tip stays put and the extra length loops up in the chamber
        const at = gate === 'tv' ? P.tv : P.pv;
        this.slack = Math.min(MAX_SLACK, this.slack + (s - at + 0.05)); s = at - 0.05;
        if (this.balloon) this.coiled = true;
        const where = gate === 'tv' ? 'No RV trace and the depth keeps rising: the catheter is coiling in the right atrium.' : 'No PA trace and the depth keeps rising: the catheter is coiling in the right ventricle.';
        if (!this.balloon && this.slack <= 8) this.notice = gate === 'tv' ? 'Without the balloon the tip curls in the right atrium. Inflate it (B) so the blood flow carries it across the tricuspid valve.' : 'The tip is bouncing in the RV outflow tract. Inflate the balloon (B) to float it through the pulmonary valve.';
        else if (this.slack > 8) this.notice = `${where} Deflate, withdraw to about 20 cm and float again.`;
      } else if (this.balloon && s > wz + CAP) { s = Math.max(s0, wz + CAP); this.notice = 'The balloon will not go further: it is jammed in a small branch. Withdraw about 1 cm.'; }
      else if (!this.balloon && s > wz + 1.5) { s = Math.max(s0, wz + 1.5); this.notice = 'A deflated tip should not be pushed this far out. Inflate the balloon and let it float to the wedge position.'; }
    } else if (ds < 0 && this.balloon) {
      // never pull an inflated balloon back through a valve
      for (const v of [P.pv, P.tv]) if (s0 >= v && s < v) { s = v + 0.05; this.notice = 'Deflate the balloon (B) before you pull back through a valve.'; break; }
    }
    this.s = s;
    // a re-float after deflating and pulling back to the RA succeeds
    if (this.coiled && !this.balloon && this.slack === 0 && this.s <= P.raEntry + 1.5) { this.coilArmed = false; this.coiled = false; }
    if (this.artefact === 'whip' && Math.abs(this.s - this.artefactAt) >= 1) this.artefact = 'none'; // repositioned
    return this.notice;
  }

  toggleBalloon() {
    if (!this.balloon && this.depth < MIN_INFLATE_DEPTH) { this.notice = 'Inflate only once the tip is beyond the introducer sheath (about 15 to 20 cm), in the vena cava or right atrium.'; return false; }
    this.balloon = !this.balloon; return this.balloon;
  }

  setArtefact(kind) { this.artefact = kind; this.artefactAt = this.s; }

  /** Flush the distal lumen. Returns 'unsafe' (balloon in the wedge zone), 'fixed' or 'ok'. */
  flush() {
    if (this.balloon && ['puw', 'pcw', 'ow'].includes(this.site)) { this.notice = 'Never flush while wedged: deflate the balloon first.'; return 'unsafe'; }
    if (this.artefact === 'over' || this.artefact === 'under') { this.artefact = 'none'; this.notice = 'Line flushed: the trace is crisp again.'; return 'fixed'; }
    this.notice = 'Line flushed.'; return 'ok';
  }

  tick(dt) {
    const site = this.site;
    this.wedgeSecs = site === 'pcw' || site === 'ow' ? this.wedgeSecs + dt : 0;
    this.owSecs = site === 'ow' ? this.owSecs + dt : 0;
  }

  /** Tip position (cm) by linear interpolation along the dense path. */
  pointAt(s = this.s) {
    const { pts, cum } = this.path;
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const u = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return add(pts[i - 1].p, mul(sub(pts[i].p, pts[i - 1].p), Math.min(1, Math.max(0, u))));
  }
}

/** Typical insertion depths for teaching (cm from the skin). */
export const DEPTHS = {
  rij: { ra: '~20', rv: '30-35', pa: '40-45', pcw: '~50' },
  fem: { ra: '30-40, longer if tall', rv: '40-50, longer if tall', pa: '50-60, longer if tall', pcw: '60-70, longer if tall' },
};
