// Cath-lab style sweep monitor on a canvas: ECG on top, catheter pressure below.
// Draws whatever samples it is given; all physiology is in sim/hemo.js.
import { SITES } from '../sim/hemo.js';

const SWEEP = 6;    // seconds across the screen
const GAP = 0.18;   // erase bar ahead of the sweep head (s)

export class Monitor {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.samples = []; this.marks = []; this.scale = 40; this.labelsOn = true; this.sitesOn = true;
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
  }
}
