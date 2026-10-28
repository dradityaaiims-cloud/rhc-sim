// Cath-lab style sweep monitor on a canvas: ECG on top, catheter pressure below.
// Draws whatever samples it is given; all physiology is in sim/hemo.js.
import { SITES } from '../sim/hemo.js';

const SWEEP = 6;    // seconds across the screen
const GAP = 0.18;   // erase bar ahead of the sweep head (s)

/** Time of the last R wave (ECG local maximum above 0.7 mV) at or before t, within 2 s, or null. */
export function rPeakBefore(samples, t) {
  for (let i = samples.length - 2; i > 0; i--) {
    const s = samples[i];
    if (s.t > t) continue;
    if (s.t < t - 2) break;
    if (s.ecg > 0.7 && s.ecg >= samples[i - 1].ecg && s.ecg >= samples[i + 1].ecg) return s.t;
  }
  return null;
}

export class Monitor {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.samples = []; this.marks = []; this.scale = 40; this.labelsOn = true; this.sitesOn = true;
    this.caliper = null; // x of the caliper line as a fraction of the plot width, or null when off
    // drag the caliper anywhere on the trace (mouse or touch)
    const at = (e) => { const r = canvas.getBoundingClientRect(), pad = 44; return Math.min(1, Math.max(0, (e.clientX - r.left - pad) / (r.width - pad - 8))); };
    canvas.addEventListener('pointerdown', (e) => { if (this.caliper === null) return; this.caliper = at(e); canvas.setPointerCapture(e.pointerId); this.dragging = true; });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.caliper = at(e); });
    for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { this.dragging = false; });
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.cv.width = Math.max(1, r.width * dpr); this.cv.height = Math.max(1, r.height * dpr);
    this.dpr = dpr;
  }
  setScale(s) { this.scale = s; }
  clear() { this.samples = []; this.marks = []; }

  /** sample = {t, ecg, p, site}; labels = [{t, label}] wave labels; a site change is marked automatically */
  push(sample, labels = []) {
    const last = this.samples.at(-1);
    if (!last || SITES[last.site].short !== SITES[sample.site].short) this.marks.push({ t: sample.t, label: SITES[sample.site].short, kind: 'site' });
    this.samples.push(sample);
    for (const l of labels) this.marks.push({ ...l, kind: 'wave', site: sample.site });
    const cut = sample.t - SWEEP;
    while (this.samples.length && this.samples[0].t < cut) this.samples.shift();
    while (this.marks.length && this.marks[0].t < cut) this.marks.shift();
  }

  draw(now) {
    const { ctx, dpr } = this, W = this.cv.width, H = this.cv.height;
    const pad = 44 * dpr, ecgH = H * 0.24, top = ecgH + 14 * dpr, bot = H - 18 * dpr;
    const xOf = (t) => pad + (((t % SWEEP) + SWEEP) % SWEEP) / SWEEP * (W - pad - 8 * dpr);
    const yP = (p) => bot - (p / this.scale) * (bot - top);
    const yE = (v) => ecgH * 0.62 - v * ecgH * 0.42;
    ctx.fillStyle = '#03080a'; ctx.fillRect(0, 0, W, H);

    // pressure grid
    const step = this.scale <= 40 ? 10 : 20;
    ctx.font = `${11 * dpr}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let p = 0; p <= this.scale; p += step) {
      ctx.strokeStyle = p === 0 ? '#2b4a40' : '#13241f'; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.moveTo(pad, yP(p)); ctx.lineTo(W, yP(p)); ctx.stroke();
      ctx.fillStyle = '#5f8a7c'; ctx.fillText(String(p), pad - 6 * dpr, yP(p));
    }
    ctx.save(); ctx.translate(12 * dpr, (top + bot) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillText('mmHg', 0, 0); ctx.restore();
    ctx.textAlign = 'left'; ctx.fillStyle = '#36e2b4'; ctx.fillText('II', 8 * dpr, ecgH * 0.3);

    const live = this.samples.filter((s) => s.t > now - SWEEP + GAP);
    const trace = (get, color, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width * dpr; ctx.lineJoin = 'round'; ctx.beginPath();
      let px = null;
      for (const s of live) {
        const x = xOf(s.t), y = get(s);
        if (px === null || x < px) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        px = x;
      }
      ctx.stroke();
    };
    trace((s) => yE(s.ecg), '#36e2b4', 1.6);
    ctx.save(); ctx.beginPath(); ctx.rect(pad, top - 10 * dpr, W, bot - top + 14 * dpr); ctx.clip(); // negative pressures clip at the baseline
    trace((s) => yP(s.p), '#ffd23f', 2.2);
    ctx.restore();

    // site markers and wave labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const m of this.marks) {
      if (m.t <= now - SWEEP + GAP) continue;
      const x = xOf(m.t);
      if (m.kind === 'site') {
        if (!this.sitesOn) continue;
        ctx.strokeStyle = '#ffb02e88'; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.moveTo(x, top - 6 * dpr); ctx.lineTo(x, bot); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#ffb02e'; ctx.font = `600 ${12 * dpr}px ui-monospace, Menlo, monospace`; ctx.fillText(m.label, x, top + 8 * dpr);
      } else if (this.labelsOn) {
        const s = live.find((q) => q.t >= m.t);
        if (!s || s.site !== m.site) continue;
        const below = m.label === 'x' || m.label === 'y', y = Math.min(bot - 2 * dpr, yP(s.p) - (below ? -16 : m.label === 'dip' ? -4 : 6) * dpr);
        ctx.fillStyle = '#e8eef6'; ctx.font = `600 ${12 * dpr}px Inter, system-ui, sans-serif`; ctx.fillText(m.label, m.label === 'notch' ? x + 18 * dpr : m.label === 'dip' ? x + 12 * dpr : x, y);
      }
    }
    // sweep head
    ctx.fillStyle = '#03080a'; const hx = xOf(now);
    ctx.fillRect(hx + 1, 0, (GAP / SWEEP) * (W - pad), H);
    if (this.caliper !== null) this.drawCaliper(live, xOf, yP, pad, H);
  }

  /** Dotted vertical line through the ECG and the pressure; reads the time since the last R wave and the pressure. */
  drawCaliper(live, xOf, yP, pad, H) {
    const { ctx, dpr } = this, W = this.cv.width, cx = pad + this.caliper * (W - pad - 8 * dpr);
    ctx.strokeStyle = '#e8eef6'; ctx.lineWidth = 1.2 * dpr; ctx.setLineDash([3 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke(); ctx.setLineDash([]);
    let s = null, best = Infinity;
    for (const q of live) { const d = Math.abs(xOf(q.t) - cx); if (d < best) { best = d; s = q; } }
    if (!s || best > 6 * dpr) return;
    const r = rPeakBefore(this.samples, s.t); // all kept samples: the R wave may already be off the left of the sweep
    const text = `${r !== null ? `R + ${Math.round((s.t - r) * 1000)} ms · ` : ''}${s.p.toFixed(0)} mmHg (${SITES[s.site].short})`;
    ctx.font = `600 ${12 * dpr}px ui-monospace, Menlo, monospace`;
    const w = ctx.measureText(text).width + 12 * dpr, bx = Math.min(W - w - 4 * dpr, Math.max(pad, cx - w / 2));
    ctx.fillStyle = '#0b1119ee'; ctx.fillRect(bx, 4 * dpr, w, 20 * dpr);
    ctx.fillStyle = '#e8eef6'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 6 * dpr, 14 * dpr);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(cx, yP(s.p), 3.5 * dpr, 0, 2 * Math.PI); ctx.fill();
  }
}
