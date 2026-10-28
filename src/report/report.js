// Builds the downloadable PDF: case summary, readings, calculations, event log, then waveform strips
// around each site change and recording, with every event marked at its time.
import { makePdf } from './pdf.js';
import { clock, stripWindows } from './session.js';
import { SITES } from '../sim/hemo.js';

const PW = 842, PH = 595, M = 40; // A4 landscape, points

/** One printed strip: ECG above, pressure below, 1 s grid, event markers. Returns a canvas. */
export function drawStrip(samples, events, t0, t1, scale) {
  const W = 1800, H = 440, pad = 60, ecgH = 120, top = ecgH + 26, bot = H - 34;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const x = (t) => pad + ((t - t0) / (t1 - t0)) * (W - pad - 12), yP = (p) => bot - (p / scale) * (bot - top), yE = (v) => ecgH * 0.6 - v * ecgH * 0.42;
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  c.font = '20px Helvetica, Arial, sans-serif'; c.textBaseline = 'middle';
  c.strokeStyle = '#f2c6c6'; c.lineWidth = 1;
  for (let t = Math.ceil(t0 * 5) / 5; t <= t1; t += 0.2) { c.beginPath(); c.moveTo(x(t), 6); c.lineTo(x(t), bot); c.stroke(); }
  const step = scale <= 40 ? 10 : 20;
  c.fillStyle = '#555'; c.textAlign = 'right';
  for (let p = 0; p <= scale; p += step) { c.strokeStyle = p ? '#f2c6c6' : '#d99'; c.beginPath(); c.moveTo(pad, yP(p)); c.lineTo(W, yP(p)); c.stroke(); c.fillText(String(p), pad - 8, yP(p)); }
  c.strokeStyle = '#d99'; c.lineWidth = 1.5;
  for (let t = Math.ceil(t0); t <= t1; t++) { c.beginPath(); c.moveTo(x(t), 6); c.lineTo(x(t), bot); c.stroke(); }
  c.textAlign = 'center'; c.fillStyle = '#333';
  for (let t = Math.ceil(t0); t <= t1; t++) c.fillText(clock(t), x(t), H - 16);
  c.textAlign = 'left'; c.fillText('II', 8, 30); c.fillText('mmHg', 4, (top + bot) / 2 - 40);
  const line = (get, color, w) => { c.strokeStyle = color; c.lineWidth = w; c.beginPath(); samples.forEach((s, i) => (i ? c.lineTo(x(s.t), get(s)) : c.moveTo(x(s.t), get(s)))); c.stroke(); };
  line((s) => yE(s.ecg), '#111', 2);
  c.save(); c.beginPath(); c.rect(pad, top - 10, W, bot - top + 12); c.clip(); line((s) => yP(s.p), '#0b4fb3', 3); c.restore();
  // site bands along the top of the pressure trace, and event markers
  c.font = 'bold 20px Helvetica, Arial, sans-serif';
  let last = null;
  for (const s of samples) if (SITES[s.site].short !== last) { last = SITES[s.site].short; c.fillStyle = '#b35c00'; c.fillText(last, x(s.t) + 4, top + 4); }
  c.font = '18px Helvetica, Arial, sans-serif';
  let row = 0;
  for (const e of events.filter((ev) => ev.t >= t0 && ev.t <= t1)) {
    c.strokeStyle = '#b35c00'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(x(e.t), top - 8); c.lineTo(x(e.t), bot); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#b35c00'; c.fillText(`${clock(e.t)} ${e.text}`.slice(0, 60), Math.min(x(e.t) + 4, W - 520), top + 30 + 22 * (row++ % 4));
  }
  return cv;
}

const jpegOf = async (cv) => new Uint8Array(await (await fetch(cv.toDataURL('image/jpeg', 0.88))).arrayBuffer());

/** info: {title, lines: [string], readings: [[label, value]], derived: [[label, value]]}; session; scale -> Blob */
export async function buildReport(info, session, scale) {
  const pages = [];
  let items = [], y = PH - M;
  const newPage = () => { if (items.length) pages.push({ w: PW, h: PH, items }); items = []; y = PH - M; };
  const text = (t, size = 10, bold = false, dx = 0) => { if (y < M + 14) newPage(); items.push({ text: t, x: M + dx, y, size, bold }); y -= size + 5; };

  text(info.title, 16, true); y -= 4;
  for (const l of info.lines) text(l, 10);
  text('Simulated data for education only. Not a medical device; not for clinical decisions. All cases are simulated.', 9); y -= 6;
  if (info.readings.length) { text('Readings (end-expiratory, as shown on the monitor)', 12, true); for (const [k, v] of info.readings) text(`${k}:  ${v}`, 10, false, 10); y -= 6; }
  if (info.derived.length) { text('Calculations', 12, true); for (const [k, v] of info.derived) text(`${k}:  ${v}`, 10, false, 10); y -= 6; }
  text('Event log (time from the start of the case)', 12, true);
  for (const e of session.events) text(`${clock(e.t)}   ${e.text}`, 10, false, 10);
  newPage();

  const wins = stripWindows(session.events, session.duration);
  if (!wins.length && session.duration > 1) wins.push([Math.max(0, session.duration - 8), session.duration]);
  const sh = 165, sw = PW - 2 * M;
  for (const [i, [a, b]] of wins.entries()) {
    if (i % 3 === 0) { newPage(); items.push({ text: `Waveform strips (ECG lead II and catheter pressure; grid lines every 0.2 s and 1 s)`, x: M, y: PH - M + 6, size: 11, bold: true }); }
    const cv = drawStrip(session.window(a, b), session.events, a, b, scale);
    const top = PH - M - 22 - (i % 3) * (sh + 14);
    items.push({ text: `Strip ${i + 1}: ${clock(a)} to ${clock(b)}`, x: M, y: top - 2, size: 9 });
    items.push({ jpeg: await jpegOf(cv), iw: cv.width, ih: cv.height, x: M, y: top - 8 - sh, w: sw, h: sh });
  }
  newPage();
  return new Blob([makePdf(pages)], { type: 'application/pdf' });
}
