// App bootstrap: wires the catheter, waveform engine, monitor, 3D heart, input and modes.
import { scenario, scaleFor, pressureAt, ecgAt, labelsIn, measure, formatReading, timing, SITES, isAF, beatAt, systoleAge } from './sim/hemo.js';
import { Transducer, measureWith } from './sim/artifacts.js';
import { Catheter, DEPTHS } from './sim/catheter.js';
import { Monitor } from './render/monitor.js';
import { Heart3D } from './render/heart3d.js';
import { store } from './ui/dom.js';
import { ExploreMode } from './modes/explore.js';
import { QuizMode } from './modes/quiz.js';
import { ProcedureMode } from './modes/procedure.js';
import { initLearn } from './learn/learn.js';
import { initBoba } from './ui/boba.js';
import { startTour } from './ui/tour.js';
import { renderAbout } from './pages/about.js';
import { MODEL_HTML } from './pages/model.js';

const $ = (id) => document.getElementById(id);
const cath = new Catheter('rij');
const monitor = new Monitor($('monitor'));
const heart = new Heart3D($('heartMount'), $('heartLabels'));
const tdx = new Transducer();
heart.setPath(cath.path);

const flags = { flushed: false, moved: false, balloonUsed: false, usedWaves: false, usedFreeze: false, openedLearn: false, recorded: false, changedScenario: false, toured: store.get('rhc.toured', false) };
let noticeTimer = null, lastNotice = null, lastNoticeAt = 0;
let simT = 0, nextSample = 0, last = performance.now(), roAt = 0;
let wavesOn = true, labelsOn = true, frozen = false;
let mode = null;
const app = {
  cath, flags, panel: $('modePanel'), sc: scenario('normal'), quiz: false, vent: false, afOverride: null,
  get af() { return this.afOverride ?? isAF(this.sc); },
  /** What the monitor reads here now: the true values, or what the artefact or a bad wedge shows. */
  reading(site = cath.site) {
    const a = cath.artefact;
    return a !== 'none' ? measureWith(this.sc, site, a, { owSecs: cath.owSecs }) : measure(this.sc, site, { af: this.af });
  },
  setScenario(id, { keepPanel = false } = {}) {
    this.sc = scenario(id); this.afOverride = null;
    cath.setCoil(this.sc.coil);
    monitor.setScale(scaleFor(this.sc)); monitor.clear(); nextSample = simT;
    if (!keepPanel) mode?.afterScenario?.();
  },
  setAccess(id) { cath.reset(id); heart.setPath(cath.path); monitor.clear(); nextSample = simT; },
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
  mode = modes[id];
  document.querySelectorAll('#modeTabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === id));
  $('hiddenCat').hidden = true;
  if (id !== 'quiz') { cath.reset(); monitor.clear(); nextSample = simT; }
  mode.enter();
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
    artefact: cath.artefact, af: app.af, slack: cath.slack,
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
const toggleBalloon = () => { if (mode.locked?.()) return; flags.balloonUsed = true; cath.toggleBalloon(); if (cath.notice) app.notice(cath.notice); };
const flush = () => {
  if (mode.locked?.()) return;
  flags.flushed = true;
  const r = cath.flush(); app.notice(cath.notice);
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
click('btnFlush', flush);
click('btnWaves', toggleWaves);
click('btnLabels', toggleLabels);
click('btnFreeze', toggleFreeze);
click('btnReset', reset);
click('btnTour', runTour);
click('btnHelp', () => toggleHelp(true));
click('btnView', () => heart.resetView());
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
  $('roVals').textContent = hide ? '' : formatReading(app.reading(site));
  const hr = app.af ? `AF ~${app.sc.hr}` : `HR ${app.sc.hr}`;
  $('roMeta').innerHTML = hide ? hr : `${hr} · depth ${cath.depth} cm${d ? ` (typical ${d})` : ''}\n`
    + `Balloon <span class="${cath.balloon ? 'bal' : ''}">${cath.balloon ? 'INFLATED' : 'deflated'}</span>${cath.wedged ? ` · wedged ${Math.round(cath.wedgeSecs)} s` : ''}`;
  $('btnBalloon').classList.toggle('on', cath.balloon);
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
    }
  }
  if (!frozen) {
    simT += dt;
    cath.tick(dt);
    for (; nextSample <= simT; nextSample += 1 / FS) {
      const site = cath.site;
      const af = app.af, t = nextSample;
      if (tdx.kind !== cath.artefact) tdx.set(cath.artefact);
      const p = tdx.step(pressureAt(app.sc, site, t, { vent: app.vent, af, owSecs: cath.owSecs }), 1 / FS, systoleAge(app.sc, t, { af }), site);
      monitor.push({ t, ecg: ecgAt(app.sc, t, { af }), p, site }, labelsIn(app.sc, site, t - 1 / FS, t, { af }));
    }
    mode.update(dt);
  }
  monitor.draw(simT);
  const b = beatAt(app.sc, simT, app.af), T = timing(60 / b.RR), ph = simT - b.start;
  const vs = (ph - T.tR - 0.03) / (T.sEnd - T.tR - 0.03);
  heart.update(cath, { vSys: vs > 0 && vs < 1 ? Math.sin(Math.PI * vs) : 0, aSys: Math.max(0, Math.cos(((ph - T.tA) / 0.08) * (Math.PI / 2))) * (Math.abs(ph - T.tA) < 0.08) }, dt);
  if (now - roAt > 150) { roAt = now; readout(); }
}

if (import.meta.env.DEV) window.__rhc = { step, app, cath, monitor, heart, setMode, modes, boba, flags, openPage, runTour };
setMode('explore');
requestAnimationFrame(frame);
if (!flags.toured) setTimeout(runTour, 500);
