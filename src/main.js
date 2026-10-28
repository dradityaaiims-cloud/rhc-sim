// App bootstrap: wires the catheter, waveform engine, monitor, 3D heart, input and modes.
import { scenario, scaleFor, pressureAt, ecgAt, labelsIn, measure, formatReading, timing, SITES, isAF, beatAt, systoleAge } from './sim/hemo.js';
import { Transducer, measureWith } from './sim/artifacts.js';
import { Catheter, DEPTHS } from './sim/catheter.js';
import { Monitor } from './render/monitor.js';
import { Heart3D, CARM } from './render/heart3d.js';
import { store } from './ui/dom.js';
import { ExploreMode } from './modes/explore.js';
import { QuizMode } from './modes/quiz.js';
import { ProcedureMode } from './modes/procedure.js';
import { initLearn } from './learn/learn.js';
import { initBoba } from './ui/boba.js';
import { startTour } from './ui/tour.js';
import { renderAbout } from './pages/about.js';
import { MODEL_HTML } from './pages/model.js';
import { CONFIG } from './pages/config.js';
import { Session, clock } from './report/session.js';
import { buildReport } from './report/report.js';
import { derive } from './sim/hemo.js';
import { ACCESS } from './sim/catheter.js';
import { ARTEFACTS } from './sim/artifacts.js';
import { satAt, thermodilution, acceptTD, vitals, fick, stepUps } from './sim/oximetry.js';
import { outputs } from './modes/procedure.js';

const $ = (id) => document.getElementById(id);
const cath = new Catheter('rij');
const monitor = new Monitor($('monitor'));
const heart = new Heart3D($('heartMount'), $('heartLabels'));
const tdx = new Transducer();
const session = new Session();
heart.setPath(cath.path);

const flags = { usedFluoro: false, flushed: false, moved: false, balloonUsed: false, usedWaves: false, usedFreeze: false, openedLearn: false, recorded: false, changedScenario: false, toured: store.get('rhc.toured', false) };
let noticeTimer = null, lastNotice = null, lastNoticeAt = 0;
let simT = 0, nextSample = 0, last = performance.now(), roAt = 0;
let wavesOn = true, labelsOn = true, frozen = false;
let mode = null;
let lastLogSite = null, lastBeat = -1, rvSecs = 0, movedAt = 0;
/** Ventricular ectopy while the tip is in the RV: more when it is moving or has stayed a while; occasional short runs. */
function ectopy(site, n) {
  if (site !== 'rv' || app.quiz) return;
  const moving = performance.now() - movedAt < 600, r = Math.random();
  if (rvSecs > 10 && r < 0.05) {
    for (let k = 1; k <= 4; k++) app.ectopic.add(n + k);
    app.log('note', 'Non-sustained VT (4 beats) with the tip in the RV'); app.notice('Run of ventricular tachycardia: the tip is irritating the RV. Float through promptly, or withdraw to the RA.');
  } else if (r < (moving ? 0.25 : 0.08)) { app.ectopic.add(n + 1); app.log('note', 'Ventricular ectopic beat (PVC)'); }
}
const app = {
  cath, flags, panel: $('modePanel'), sc: scenario('normal'), quiz: false, vent: false, afOverride: null,
  tx: { zeroed: true, drift: 0, height: 0 },  // transducer: zeroed to air? height above the phlebostatic axis (cm)
  lab: { td: [], sats: {} },                   // thermodilution injections and blood samples in this case
  ectopic: new Set(),                          // beat numbers that are PVCs
  /** mmHg added to every reading by the transducer: drift until zeroed, about 0.75 mmHg per cm off the axis */
  get offset() { return (this.tx.zeroed ? 0 : this.tx.drift) - 0.74 * this.tx.height; },
  get af() { return this.afOverride ?? isAF(this.sc); },
  /** What the monitor reads here now: the true values, or what the artefact or a bad wedge shows. */
  reading(site = cath.site) {
    const a = cath.artefact, m = a !== 'none' ? measureWith(this.sc, site, a, { owSecs: cath.owSecs }) : measure(this.sc, site, { af: this.af });
    const off = this.offset;
    if (Math.abs(off) >= 0.5) for (const k of ['sys', 'dia', 'mean', 'a', 'v', 'edp', 'ed']) if (m[k] != null) m[k] = Math.round(m[k] + off);
    return m;
  },
  setScenario(id, { keepPanel = false } = {}) {
    this.sc = scenario(id); this.afOverride = null;
    cath.setCoil(this.sc.coil);
    monitor.setScale(scaleFor(this.sc)); monitor.clear(); nextSample = simT;
    if (!keepPanel) { mode?.afterScenario?.(); this.newCase(); }
  },
  setAccess(id) { cath.reset(id); heart.setPath(cath.path); monitor.clear(); nextSample = simT; this.newCase(); },
  /** a fresh report: called when the scenario, access or mode changes */
  newCase() {
    session.reset(); lastLogSite = null; this.lab = { td: [], sats: {} }; this.ectopic = new Set(); renderLab();
    session.event(simT, 'case', `Case started: ${mode?.id === 'case' ? 'unknown patient' : this.sc.name}, ${ACCESS[cath.access].name.toLowerCase()} access`);
  },
  log(kind, text) { session.event(simT, kind, text); },
  placeAt(site) {
    const P = cath.path;
    cath.reset();
    cath.s = { ra: (P.raEntry + P.tv) / 2, rv: (P.tv + P.pv) / 2, pa: (P.pv + P.wedgeZone) / 2, pcw: P.wedgeZone + 0.4 }[site];
    cath.balloon = site === 'pcw'; cath.coilArmed = false;
    monitor.clear(); nextSample = simT;
  },
  /** quiz: hide the catheter, site markers, wave labels and readout; keepCatheterHidden reveals the trace labels only */
  setQuiz(on, { keepCatheterHidden = false } = {}) {
    this.quiz = on;
    $('hiddenCat').hidden = !(on || keepCatheterHidden);
    monitor.sitesOn = !on; monitor.labelsOn = !on && wavesOn;
  },
  notice(msg) {
    const n = $('notice'); n.textContent = msg; n.hidden = false;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { n.hidden = true; }, 4500);
  },
};
app.setScenario('normal');

const modes = { explore: new ExploreMode(app), quiz: new QuizMode(app), procedure: new ProcedureMode(app), case: new ProcedureMode(app, { game: true }) };
function setMode(id) {
  mode?.exit();
  if (id !== 'procedure' && id !== 'case') { app.tx = { zeroed: true, drift: 0, height: 0 }; app.syncTx?.(); }
  mode = modes[id];
  document.querySelectorAll('#modeTabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === id));
  $('hiddenCat').hidden = true;
  if (id !== 'quiz') { cath.reset(); monitor.clear(); nextSample = simT; }
  mode.enter();
  app.newCase();
}

// ── learn tab, pages, tour, Boba ─────────────────────────────────────────
const t0 = Date.now();
const learnTab = $('navLearn');
const setActiveTab = (btn) => document.querySelectorAll('#modeTabs button').forEach((b) => b.classList.toggle('active', b === btn));
function openLearn(section) {
  document.body.classList.add('learning'); document.body.classList.remove('paging');
  setActiveTab(learnTab); flags.openedLearn = true;
  if (section) learn.open(section);
}
function openPage(id) {
  const page = $('page');
  document.body.classList.add('learning', 'paging');
  if (id === 'about') renderAbout(page); else page.innerHTML = MODEL_HTML;
  page.scrollTop = 0;
  setActiveTab($(id === 'about' ? 'navAbout' : 'navModel'));
}
function closeLearn() {
  if (!document.body.classList.contains('learning')) return;
  document.body.classList.remove('learning', 'paging');
  document.querySelectorAll('#modeTabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode.id));
}
const learn = initLearn({
  root: $('learn'),
  onTour: () => { closeLearn(); runTour(); },
  onGoto(id) { closeLearn(); app.setScenario(id, { keepPanel: true }); setMode('explore'); },
});

function runTour() {
  closeLearn();
  startTour([
    { title: 'Welcome', text: 'This two-minute tour walks through the screen, then lets you float the catheter yourself. Use Next or the ← → keys; Esc skips. Educational use only: this is not for clinical use.', enter: () => setMode('explore') },
    { title: 'The monitor', target: '#monitorPane', text: 'The green trace is the ECG; the yellow trace is the pressure at the catheter tip, sweeping left to right on a fixed mmHg scale. Each change of site is marked with an orange dashed line, and the letters label the parts of each wave.' },
    { title: 'Readings', target: '#readout', text: 'Where the tip is, the end-expiratory readings for that site, the insertion depth (with the typical depth for comparison) and the balloon state.' },
    { title: 'The 3D heart', target: '#heartPane', text: 'A transparent heart from the NIH Human Reference Atlas, in the anteroposterior view: blue right heart and cavae, purple pulmonary arteries, faint red left heart and aorta. The yellow line is the catheter and the red dot its tip. Drag to rotate, scroll to zoom.' },
    { title: 'Advance', target: '#drive', text: 'Hold W (or the Advance button) to advance, S to withdraw. Shift is fine control.', tryText: 'advance into the right atrium', enter: () => cath.reset(), done: () => cath.site === 'ra' },
    { title: 'Inflate the balloon', target: '#btnBalloon', text: 'The catheter is flow-directed: once the tip is in the RA, inflate the balloon (B) and the blood flow will carry it through the valves.', tryText: 'press B', done: () => cath.balloon },
    { title: 'Float to the wedge', target: '#monitorPane', text: 'Keep advancing and watch the trace: RA, then RV (diastolic near zero), then PA (diastolic steps up), then the wedge (atrial-looking again).', tryText: 'reach the wedge position', done: () => cath.site === 'pcw' },
    { title: 'Fluoroscopy', target: '#btnFluoro', text: 'Switch the right pane to a simulated fluoroscopy image (V), and pick the C-arm view: AP, RAO 30°, LAO 45° or lateral (C cycles them). The catheter is radiopaque; the inflated balloon is a small lucent bubble.' },
    { title: 'Wave labels and freeze', target: '.tools', text: 'A turns the wave labels on and off, L the 3D labels, F freezes the monitor so you can study a beat. R pulls the catheter back to the start. Remember to deflate before withdrawing.' },
    { title: 'Modes', target: '#modeTabs', text: 'Free explore: any scenario. Name that waveform: identify the site from the trace alone. Do the RHC: record every site and get the calculations and a score. Diagnose the case: an unknown patient. M cycles modes.' },
    { title: 'Mode panel', target: '#modePanel', text: 'Scenarios, questions, the recording checklist, calculations and scores appear here.' },
    { title: 'Learn tab', target: '#navLearn', text: 'How RHC works, each waveform and its normal values, the calculations and pulmonary hypertension definitions, and every scenario with a "Show in sim" button.' },
    { title: 'Boba', target: '.boba-dog', text: 'Boba is your assistant. Click for a tip, double-click for zoomies, or press Hush. Boba notices what you are doing and chimes in. Enjoy, and remember this is a teaching tool, not for clinical use.' },
  ], { onEnd() { flags.toured = true; store.set('rhc.toured', true); setMode('explore'); } });
}

const boba = initBoba({
  onTour: runTour, onLearn: () => openLearn(),
  getCtx: () => ({
    t: (Date.now() - t0) / 1000, mode: mode.id, site: app.quiz ? null : cath.site, balloon: cath.balloon,
    notice: Date.now() - lastNoticeAt < 10e3 ? lastNotice : null, wedgeSecs: cath.wedgeSecs, scenario: app.sc.id, flags,
    artefact: cath.artefact, af: app.af, slack: cath.slack, offset: app.offset, vol: cath.vol, tdCount: app.lab.td.length,
    quiz: mode.id === 'quiz' && mode.q ? { answered: mode.q.answered, secs: (Date.now() - mode.t0) / 1000 } : null,
  }),
});

// ── input ────────────────────────────────────────────────────────────────
const held = new Set();
const help = $('help');
const toggleHelp = (v = help.hidden) => { help.hidden = !v; };
const toggleWaves = () => { flags.usedWaves = true; wavesOn = !wavesOn; monitor.labelsOn = wavesOn && !app.quiz; $('btnWaves').classList.toggle('on', wavesOn); };
const toggleLabels = () => { labelsOn = !labelsOn; heart.setLabels(labelsOn); $('readout').hidden = !labelsOn; $('btnLabels').classList.toggle('on', labelsOn); };
const toggleFreeze = () => { flags.usedFreeze = true; frozen = !frozen; $('frozen').hidden = !frozen; $('btnFreeze').classList.toggle('on', frozen); };
const toggleBalloon = () => {
  if (mode.locked?.()) return; flags.balloonUsed = true;
  const was = cath.balloon; cath.toggleBalloon();
  if (cath.notice) app.notice(cath.notice);
  if (cath.balloon !== was) app.log('balloon', `Balloon ${cath.balloon ? 'inflated' : 'deflated'} at ${cath.depth} cm`);
};
const flush = () => {
  if (mode.locked?.()) return;
  flags.flushed = true;
  const r = cath.flush(); app.notice(cath.notice); app.log('monitor', r === 'unsafe' ? 'Flush refused: balloon wedged' : 'Line flushed');
  if (r === 'unsafe') mode.onEvent?.('flushWedged');
};
const reset = () => { if (!mode.locked?.()) { cath.reset(); } };
const KEYMAP = { ArrowUp: 'w', ArrowDown: 's' };

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['SELECT', 'INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && e.key !== 'Escape') return;
  let k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (['ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
  if (document.body.classList.contains('learning')) { if (k === 'Escape') closeLearn(); return; }
  if (!help.hidden) { toggleHelp(false); return; }
  if (mode.onKey?.(k)) { e.preventDefault(); return; }
  k = KEYMAP[k] ?? k;
  if (e.repeat && k !== 'w' && k !== 's') return;
  if (k === 'h') toggleHelp(true);
  else if (k === 'a') toggleWaves();
  else if (k === 'l') toggleLabels();
  else if (k === 'f') toggleFreeze();
  else if (k === 'b') toggleBalloon();
  else if (k === 'r') reset();
  else if (k === 'x') flush();
  else if (k === 'u') toggleLungs();
  else if (k === 'v') toggleFluoro();
  else if (k === 'z') zero();
  else if (k === '[') nudgeVol(-0.25);
  else if (k === ']') nudgeVol(0.25);
  else if (k === 't') thermo();
  else if (k === 'd') sample();
  else if (k === 'k') toggleCaliper();
  else if (k === 'p') downloadReport();
  else if (k === 'c') cycleCarm();
  else if (k === 'm') { const ids = Object.keys(modes); setMode(ids[(ids.indexOf(mode.id) + 1) % ids.length]); }
  else if (k === 'w' || k === 's' || k === 'Shift') { held.add(k); if (k !== 'Shift') flags.moved = true; }
});
window.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; held.delete(KEYMAP[k] ?? k); });
window.addEventListener('blur', () => held.clear());

// press-and-hold drive buttons (mouse and touch)
for (const [id, k] of [['btnAdvance', 'w'], ['btnWithdraw', 's']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); held.add(k); flags.moved = true; b.setPointerCapture(e.pointerId); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => held.delete(k));
}
const click = (id, fn) => $(id).addEventListener('click', (e) => { fn(); e.currentTarget.blur(); });
click('btnBalloon', toggleBalloon);
const nudgeVol = (d) => {
  if (mode.locked?.()) return; flags.balloonUsed = true;
  const was = cath.vol; cath.setVolume(cath.vol + d);
  if (cath.notice) app.notice(cath.notice);
  if (cath.vol !== was) app.log('balloon', `Balloon ${cath.vol.toFixed(2)} mL at ${cath.depth} cm${cath.site === 'pcw' && cath.vol < 0.75 ? ' (wedged with little air: suspect a distal, over-wedged tip)' : ''}`);
};
click('btnVolDown', () => nudgeVol(-0.25)); click('btnVolUp', () => nudgeVol(0.25));
// transducer: zero to air and set its height relative to the phlebostatic axis
app.syncTx = () => { $('txH').value = app.tx.height; $('txHv').textContent = `${app.tx.height > 0 ? '+' : ''}${app.tx.height} cm`; $('btnZero').classList.toggle('on', app.tx.zeroed); mode?.render?.(); };
const zero = () => { app.tx.zeroed = true; app.log('monitor', 'Transducer zeroed to air'); app.notice('Zeroed to air.'); app.syncTx(); };
click('btnZero', zero);
$('txH').addEventListener('input', (e) => { app.tx.height = Number(e.target.value); $('txHv').textContent = `${app.tx.height > 0 ? '+' : ''}${app.tx.height} cm`; });
$('txH').addEventListener('change', (e) => { app.log('monitor', `Transducer height ${app.tx.height > 0 ? '+' : ''}${app.tx.height} cm from the phlebostatic axis`); app.syncTx(); e.target.blur(); });
// thermodilution (tip in the PA, balloon down) and blood samples (any site)
function thermo() {
  if (mode.locked?.() || app.quiz) return;
  if (cath.site !== 'pa' || cath.balloon) { app.notice('Thermodilution needs the thermistor in the pulmonary artery with the balloon deflated.'); return; }
  const td = thermodilution(app.sc); app.lab.td.push(td);
  const acc = acceptTD(app.lab.td.map((x) => x.co));
  app.log('record', `Thermodilution #${app.lab.td.length}: ${td.co.toFixed(2)} L/min${acc.mean ? ` (last three mean ${acc.mean}, ${acc.ok ? 'within 10%' : 'spread over 10%: repeat'})` : ''}`);
  renderLab(); mode.render?.();
}
function sample() {
  if (mode.locked?.() || app.quiz) return;
  const site = cath.site, sat = satAt(app.sc, site), name = SITES[site].short === 'PCW' ? 'PCW' : SITES[site].short;
  if (sat == null) { app.notice('Nothing aspirates: the tip is jammed against the wall (over-wedged). Withdraw slightly.'); return; }
  const key = site === 'puw' ? 'pcw' : site;
  app.lab.sats[key] = sat;
  app.log('record', `Blood sample ${name}: ${sat}%${site === 'puw' ? ' (under 88%: not a true wedge sample)' : ''}`);
  renderLab(); mode.render?.();
}
click('btnThermo', thermo); click('btnSample', sample);
function renderLab() {
  const box = $('lab'), td = app.lab.td, sats = app.lab.sats;
  box.hidden = !td.length && !Object.keys(sats).length;
  if (box.hidden) return;
  const acc = acceptTD(td.map((x) => x.co)), f = fick(app.sc, sats), su = stepUps(sats);
  const order = ['svc', 'ivc', 'ra', 'rv', 'pa', 'pcw'].filter((k) => sats[k] != null);
  box.innerHTML = `<div class="cap">LAB</div>`
    + (td.length ? `<canvas id="tdCurve" width="300" height="90"></canvas><div>TD: ${td.slice(-3).map((x) => x.co.toFixed(2)).join(', ')} L/min${acc.mean ? ` → <b>${acc.mean}</b> ${acc.ok ? '✓' : '(over 10%: repeat)'}` : ''}${td.at(-1).unreliable ? '<br><span class="warn">Unreliable here (TR or shunt)</span>' : ''}</div>` : '')
    + (order.length ? `<div>Sats: ${order.map((k) => `${k.toUpperCase()} ${sats[k]}%`).join(' · ')}</div>` : '')
    + (f ? `<div>Fick: Qs ${f.qs} L/min${f.qp != null ? `, Qp ${f.qp}, Qp/Qs ${f.qpqs}` : ''}${su.length ? ` · step-up: ${su.join(', ')}` : ''}</div>` : '');
  const cv = $('tdCurve');
  if (cv) { // last three cooling curves, newest brightest
    const c = cv.getContext('2d'); c.clearRect(0, 0, 300, 90);
    td.slice(-3).forEach((x, i, arr) => {
      const mx = Math.max(...x.curve.map(([, v]) => v));
      c.strokeStyle = `rgba(106,168,255,${0.35 + 0.65 * (i === arr.length - 1)})`; c.lineWidth = 2; c.beginPath();
      x.curve.forEach(([t, v], j) => { const px = (t / 12) * 296 + 2, py = 86 - (v / mx) * 76; j ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.stroke();
    });
  }
}
click('btnFlush', flush);
click('btnWaves', toggleWaves);
click('btnLabels', toggleLabels);
click('btnFreeze', toggleFreeze);
click('btnReset', reset);
click('btnTour', runTour);
click('btnHelp', () => toggleHelp(true));
click('btnView', () => heart.resetView());
let fluoroSecs = 0;
const carmBtns = Object.keys(CARM).map((v) => { const b = document.createElement('button'); b.textContent = v; b.onclick = (e) => { setCarm(v); e.currentTarget.blur(); }; $('carm').append(b); return b; });
const chipHeart = () => { $('chipHeart').textContent = heart.mode === 'fluoro' ? `FLUORO · ${heart.view.toUpperCase()} · ${Math.floor(fluoroSecs / 60)}:${String(Math.floor(fluoroSecs % 60)).padStart(2, '0')}` : '3D HEART · AP VIEW'; };
function setCarm(v) { if (heart.mode === 'fluoro' && v !== heart.view) app.log('monitor', `C-arm ${v}`); heart.setView(v); carmBtns.forEach((b) => b.classList.toggle('active', b.textContent === v)); chipHeart(); }
function toggleFluoro() {
  flags.usedFluoro = true;
  const fl = heart.mode !== 'fluoro';
  heart.setMode(fl ? 'fluoro' : '3d');
  $('heartPane').classList.toggle('fluoro', fl); $('carm').hidden = !fl; $('btnFluoro').classList.toggle('on', fl);
  setCarm(heart.view);
  app.log('monitor', fl ? `Fluoroscopy on (${heart.view})` : 'Fluoroscopy off');
}
const cycleCarm = () => { if (heart.mode !== 'fluoro') return; const v = Object.keys(CARM); setCarm(v[(v.indexOf(heart.view) + 1) % v.length]); };
click('btnFluoro', toggleFluoro);
const toggleCaliper = () => { monitor.caliper = monitor.caliper === null ? 0.5 : null; $('btnCaliper').classList.toggle('on', monitor.caliper !== null); };
click('btnCaliper', toggleCaliper);
async function downloadReport() {
  const sc = app.sc, hidden = mode.id === 'case' && !mode.done;
  const rec = mode.run?.recorded;
  const visited = [...new Set(session.samples.map((s) => s.site))].filter((s) => ['ra', 'rv', 'pa', 'pcw'].includes(s));
  const readings = rec ? Object.entries(rec) : visited.map((s) => [s, measure(sc, s, { af: app.af })]);
  const byKey = Object.fromEntries(readings);
  const o = outputs(sc, app.lab), d = derive(byKey, o.flowForPVR ?? (mode.run ? null : sc.co)), v = vitals(sc, byKey.ra?.mean);
  const sats = app.lab.sats, satKeys = ['svc', 'ivc', 'ra', 'rv', 'pa', 'pcw'].filter((k) => sats[k] != null);
  const info = {
    title: 'Right heart catheterization: simulated haemodynamic report',
    lines: [
      `Dr. Singh's RHC Sim v${CONFIG.version} (doi:${CONFIG.doi}).  Generated ${new Date().toLocaleString()}.`,
      `Case started ${session.startedAt.toLocaleTimeString()}, duration ${clock(session.duration)}.  Mode: ${document.querySelector(`#modeTabs [data-mode=${mode.id}]`).textContent}.`,
      `Scenario: ${hidden ? 'hidden until you diagnose it' : sc.name}.  Access: ${ACCESS[cath.access].name}.  Rhythm: ${app.af ? 'atrial fibrillation' : 'sinus'} (${sc.hr}/min).  Breathing: ${app.vent ? 'ventilator' : 'spontaneous'}.  Fluoroscopy time ${clock(fluoroSecs)}.`,
    ],
    readings: readings.map(([k, m]) => [SITES[k].name, formatReading(m) + (mode.run?.flaws?.[k] ? '  (flagged: see the event log)' : '')]),
    derived: [
      ['Arterial BP, SpO2', `${v.sbp}/${v.dbp} (MAP ${v.map}) mmHg, ${v.spo2}%`],
      ['Transducer', `${app.tx.zeroed ? 'zeroed' : 'NOT zeroed'}, ${app.tx.height ? `${Math.abs(app.tx.height)} cm ${app.tx.height > 0 ? 'above' : 'below'}` : 'level with'} the phlebostatic axis at the end of the case`],
      ...(app.lab.td.length ? [['Thermodilution', `${app.lab.td.map((x) => x.co.toFixed(2)).join(', ')} L/min${o.td.mean ? `; last three mean ${o.td.mean} (${o.td.ok ? 'within 10%' : 'spread over 10%'})` : ''}`]] : []),
      ...(satKeys.length ? [['Saturations', satKeys.map((k) => `${k.toUpperCase()} ${sats[k]}%`).join(', ')]] : []),
      ...(o.fick ? [['Fick', `Qs ${o.fick.qs} L/min (mixed venous ${o.fick.mvSat}%)${o.fick.qp != null ? `, Qp ${o.fick.qp} L/min, Qp/Qs ${o.fick.qpqs}` : ''}${stepUps(sats).length ? `; step-up: ${stepUps(sats).join(', ')}` : ''}`]] : []),
      ['Cardiac output used', o.co ? `${o.co.toFixed(2)} L/min (${o.method}); CI ${(o.co / 1.9).toFixed(2)} L/min/m2` : mode.run ? 'not measured' : `${sc.co.toFixed(1)} L/min (scenario value)`],
      ...(o.co && byKey.ra ? [['SVR', `${Math.round(((v.map - byKey.ra.mean) / o.co) * 10) / 10} WU (${Math.round(((v.map - byKey.ra.mean) / o.co) * 80)} dyn.s.cm-5)`]] : []),
      ...(d ? [['TPG = mPAP - PCWP', `${d.tpg} mmHg`], ['DPG = PAd - PCWP', `${d.dpg} mmHg`], [`PVR (TPG / ${sc.shunt ? 'Qp' : 'CO'})`, `${d.pvr} WU`], ...(d.papi != null ? [['PAPi', `${d.papi}`]] : []), ['Interpretation', d.ph]] : []),
    ],
  };
  app.notice('Building the PDF report…');
  const blob = await buildReport(info, session, monitor.scale);
  const a = document.createElement('a'), stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  a.href = URL.createObjectURL(blob); a.download = `rhc-report-${stamp}.pdf`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  app.notice('Report downloaded.');
}
click('btnReport', downloadReport);
const toggleLungs = () => { heart.setLungs(!heart.lungsOn); $('btnLungs').classList.toggle('on', heart.lungsOn); };
click('btnLungs', toggleLungs);
help.addEventListener('click', () => toggleHelp(false));
document.querySelectorAll('#modeTabs button').forEach((b) => b.addEventListener('click', () => {
  if (b === learnTab) openLearn();
  else if (b.id === 'navModel') openPage('model');
  else if (b.id === 'navAbout') openPage('about');
  else { closeLearn(); setMode(b.dataset.mode); }
  b.blur();
}));

// ── loop ─────────────────────────────────────────────────────────────────
const SPEED = 4; // cm/s
const FS = 250;  // monitor samples per second

function readout() {
  const site = cath.site, d = DEPTHS[cath.access][site];
  const hide = app.quiz;
  $('roSite').textContent = hide ? '?' : SITES[site].name;
  $('roVals').textContent = hide || (mode.measureSelf && mode.phase === 'run') ? '' : formatReading(app.reading(site));
  const hr = app.af ? `AF ~${app.sc.hr}` : `HR ${app.sc.hr}`;
  $('roMeta').innerHTML = hide ? hr : `${hr} · depth ${cath.depth} cm${d ? ` (typical ${d})` : ''}\n`
    + `Balloon <span class="${cath.balloon ? 'bal' : ''}">${cath.vol.toFixed(2)} mL</span>${cath.wedged ? ` · wedged ${Math.round(cath.wedgeSecs)} s` : ''}`;
  $('btnBalloon').classList.toggle('on', cath.balloon); $('volText').textContent = `${cath.vol.toFixed(2)} mL`;
  const v = vitals(app.sc);
  $('vitals').textContent = `ABP ${v.sbp}/${v.dbp} (${v.map})   SpO₂ ${v.spo2}%   RR ${Math.round(60 / 4.5)}`;
  $('txWarn').hidden = Math.abs(app.offset) < 1;
  $('txWarn').textContent = `${app.tx.zeroed ? '' : 'NOT ZEROED · '}${Math.abs(app.tx.height) >= 1 ? `${Math.abs(app.tx.height)} cm ${app.tx.height > 0 ? 'ABOVE' : 'BELOW'} AXIS` : 'LEVEL'}`;
}

function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now; // tolerate slow or throttled frames
  if (!document.body.classList.contains('learning')) step(dt, now);
  requestAnimationFrame(frame);
}

function step(dt, now = performance.now()) {
  if (!mode.locked?.()) {
    const v = SPEED * (held.has('Shift') ? 0.3 : 1) * dt;
    if (held.has('w')) cath.advance(v);
    if (held.has('s')) cath.advance(-v);
    const n = cath.notice;
    if (n && (n !== lastNotice || Date.now() - lastNoticeAt > 3000)) { // one event per push, not per frame
      mode.onEvent?.(/Deflate/.test(n) ? 'pullbacks' : /balloon/i.test(n) ? 'blocked' : 'other');
      app.notice(n); lastNotice = n; lastNoticeAt = Date.now();
      app.log('note', n.split(/(?<=\.) /)[0]);
    }
  }
  if (!frozen) {
    simT += dt;
    cath.tick(dt); rvSecs = cath.site === 'rv' ? rvSecs + dt : 0;
    if (held.has('w') || held.has('s')) movedAt = performance.now();
    if (heart.mode === 'fluoro') { fluoroSecs += dt; chipHeart(); }
    for (; nextSample <= simT; nextSample += 1 / FS) {
      const site = cath.site;
      const af = app.af, t = nextSample;
      if (tdx.kind !== cath.artefact) tdx.set(cath.artefact);
      const bt = beatAt(app.sc, t, af);
      if (bt.n !== lastBeat) { lastBeat = bt.n; ectopy(site, bt.n); }
      const p = tdx.step(pressureAt(app.sc, site, t, { vent: app.vent, af, owSecs: cath.owSecs, ectopic: app.ectopic }), 1 / FS, systoleAge(app.sc, t, { af }), site) + app.offset;
      const smp = { t, ecg: ecgAt(app.sc, t, { af, ectopic: app.ectopic }), p, site };
      monitor.push(smp, labelsIn(app.sc, site, t - 1 / FS, t, { af }));
      session.push(smp);
      if (SITES[site].short !== lastLogSite) { lastLogSite = SITES[site].short; if (!app.quiz) session.event(t, 'site', `${SITES[site].short === 'PCW' && site !== 'pcw' ? 'PCW? (balloon in the wedge zone)' : SITES[site].name} at ${cath.depth} cm`); }
    }
    mode.update(dt);
  }
  monitor.draw(simT);
  const b = beatAt(app.sc, simT, app.af), T = timing(60 / b.RR), ph = simT - b.start;
  const vs = (ph - T.tR - 0.03) / (T.sEnd - T.tR - 0.03);
  heart.update(cath, { vSys: vs > 0 && vs < 1 ? Math.sin(Math.PI * vs) : 0, aSys: Math.max(0, Math.cos(((ph - T.tA) / 0.08) * (Math.PI / 2))) * (Math.abs(ph - T.tA) < 0.08) }, dt);
  if (now - roAt > 150) { roAt = now; readout(); }
}

if (import.meta.env.DEV) window.__rhc = { session, downloadReport, step, app, cath, monitor, heart, setMode, modes, boba, flags, openPage, runTour };
setMode('explore');
requestAnimationFrame(frame);
if (!flags.toured) setTimeout(runTour, 500);
