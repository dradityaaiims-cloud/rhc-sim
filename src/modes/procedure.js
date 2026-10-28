// "Do the RHC" (navigate): checklist, zero and level, float the catheter, record RA, RV, PA and PCW,
// measure the cardiac output and saturations, and get the haemodynamics.
// "Diagnose the case" (game): the same run on a hidden scenario, then name the diagnosis.
import { el, store } from '../ui/dom.js';
import { SCENARIOS, SITES, scenario, formatReading, derive } from '../sim/hemo.js';
import { ARTEFACTS } from '../sim/artifacts.js';
import { fick, acceptTD, vitals, stepUps } from '../sim/oximetry.js';
import { RECORD_SITES, scoreRun, diagnosisOptions } from './scoring.js';

export const CHECKLIST = [
  ['timeout', 'Time-out: patient identity, consent, procedure and site, allergies, anticoagulation'],
  ['monitor', 'Monitoring on: ECG, pulse oximetry, blood pressure'],
  ['flush', 'Flush every lumen of the catheter with heparinised saline (no air)'],
  ['balloon', 'Test the balloon under saline: 1.5 mL, symmetric, no leak; then deflate'],
  ['zero', 'Zero the transducer to air and level it at the phlebostatic axis'],
];
// what you read off the trace yourself, per site
const FIELDS = { ra: [['a', 'a wave'], ['v', 'v wave'], ['mean', 'mean']], rv: [['sys', 'systolic'], ['edp', 'end-diastolic']],
  pa: [['sys', 'systolic'], ['dia', 'diastolic'], ['mean', 'mean']], pcw: [['a', 'a wave'], ['v', 'v wave'], ['mean', 'mean']] };

/** Cardiac output in use: accepted thermodilution, else Fick; pulmonary flow (Qp) for PVR when there is a shunt. */
export function outputs(sc, lab) {
  const td = acceptTD(lab.td.map((x) => x.co)), f = fick(sc, lab.sats);
  const co = td.ok ? td.mean : f?.qs ?? null;
  return { td, fick: f, co, flowForPVR: sc.shunt ? f?.qp ?? null : co, method: td.ok ? 'thermodilution' : f ? 'Fick' : null };
}

export class ProcedureMode {
  constructor(app, { game = false } = {}) { this.app = app; this.game = game; this.id = game ? 'case' : 'procedure'; }
  locked() { return this.phase === 'prep'; }
  enter() {
    const { app } = this;
    if (this.game) app.setScenario(SCENARIOS.filter((s) => s.id !== 'normal')[Math.floor(Math.random() * (SCENARIOS.length - 1))].id, { keepPanel: true });
    app.cath.reset();
    // a real line starts unzeroed, with the transducer off the phlebostatic axis
    app.tx = { zeroed: false, drift: Math.round(4 + Math.random() * 5), height: (Math.random() < 0.5 ? -1 : 1) * Math.round(5 + Math.random() * 6) };
    // a real case can come with a monitoring problem to spot and fix
    if (this.game && Math.random() < 0.5) app.cath.setArtefact(['whip', 'over', 'under'][Math.floor(Math.random() * 3)]);
    this.run = { recorded: {}, blocked: 0, pullbacks: 0, flushWedged: 0, wedgeMax: 0, secs: 0, flaws: {}, prep: 0, coMeasured: false, measured: {} };
    this.checks = new Set(); this.phase = 'prep'; this.form = null;
    this.measureSelf = store.get('rhc.measureSelf', false);
    this.done = false;
    app.syncTx?.(); // also renders
  }
  exit() { this.phase = null; }
  begin(skip = false) {
    this.run.prep = skip ? 0 : this.checks.size / CHECKLIST.length;
    if (skip) this.app.log('note', 'Pre-procedure checklist skipped');
    this.phase = 'run';
    this.app.log('case', 'Procedure started');
    this.render();
  }
  tick(id) {
    if (id === 'zero') { this.app.notice('Use the transducer controls on the monitor: Zero (Z), then set the height to 0 cm.'); return; }
    this.checks.has(id) ? this.checks.delete(id) : this.checks.add(id);
    this.render();
  }
  record() {
    if (this.done || this.phase !== 'run') return;
    const site = this.app.cath.site, key = site === 'puw' || site === 'ow' ? 'pcw' : site;
    if (!RECORD_SITES.includes(key)) { this.app.notice('Record in the RA, RV, PA or wedge position.'); return; }
    if (this.measureSelf) { this.form = { site, key }; this.render(); return; }
    this.store(site, key, this.app.reading(site));
  }
  /** keep what the monitor showed (or what you read), and note anything that made it wrong */
  store(site, key, m, yours = null) {
    const art = this.app.cath.artefact, off = this.app.offset, notes = [];
    this.run.recorded[key] = m;
    this.app.log('record', `Recorded ${SITES[key].short}: ${formatReading(m)}${yours ? ' (your reading)' : ''}`);
    if (key !== site) notes.push(`${SITES[site].real}: the wedge you recorded was not valid.`);
    else if (art !== 'none' && !(art === 'whip' && site !== 'pa' && site !== 'rv')) notes.push(`${ARTEFACTS[art].name} trace when you recorded the ${SITES[key].short}. ${ARTEFACTS[art].fix}`);
    if (Math.abs(off) >= 2) notes.push(`The transducer was ${this.app.tx.zeroed ? '' : 'not zeroed and '}${Math.abs(this.app.tx.height) >= 1 ? `${Math.abs(this.app.tx.height)} cm ${this.app.tx.height > 0 ? 'above' : 'below'} the phlebostatic axis` : 'level'} when you recorded the ${SITES[key].short}: every number was off by ${off > 0 ? '+' : ''}${off.toFixed(0)} mmHg.`);
    if (yours) notes.push(...yours);
    if (notes.length) this.run.flaws[key] = notes.join(' '); else delete this.run.flaws[key];
    this.app.flags.recorded = true; this.form = null;
    this.render();
  }
  submitForm(inputs) {
    const { site, key } = this.form, truth = this.app.reading(site), m = { site: key }, off = [];
    for (const [f, label] of FIELDS[key]) {
      const v = Number(inputs[f].value);
      if (inputs[f].value === '' || !Number.isFinite(v)) { this.app.notice(`Enter the ${label}.`); return; }
      m[f] = v;
      const t = truth[f] ?? truth.mean;
      if (t != null && Math.abs(v - t) > 3) off.push(`${label} ${v} (the trace shows ${t})`);
    }
    this.run.measured[key] = !off.length;
    this.store(site, key, m, off.length ? [`Your ${SITES[key].short} reading was off by more than 3 mmHg: ${off.join(', ')}. Freeze, use the caliper, and read at end-expiration.`] : null);
  }
  onEvent(kind) { if (!this.done && kind in this.run) this.run[kind]++; }
  update(dt) {
    if (this.done || this.phase !== 'run') return;
    this.run.secs += dt;
    this.run.wedgeMax = Math.max(this.run.wedgeMax, this.app.cath.wedgeSecs);
    if (this.checks && !this.checks.has('zero') && this.app.tx.zeroed && Math.abs(this.app.tx.height) < 1) this.checks.add('zero');
  }
  finish(diagnosis) {
    this.done = true;
    const o = outputs(this.app.sc, this.app.lab);
    this.run.coMeasured = !!o.co;
    if (this.game) this.run.diagnosis = diagnosis === this.app.sc.id;
    this.result = scoreRun(this.run);
    this.render(diagnosis);
  }
  render(diagnosis) {
    const { app, run } = this, sc = app.sc;
    if (this.phase === 'prep') {
      if (app.tx.zeroed && Math.abs(app.tx.height) < 1) this.checks.add('zero');
      const all = CHECKLIST.every(([id]) => this.checks.has(id));
      app.panel.replaceChildren(
        el('div', { class: 'grow' }, el('h3', {}, `${this.game ? 'Diagnose the case' : `Do the RHC: ${sc.name}`}: before you start`),
          el('p', {}, 'Work through the checklist. The transducer starts unzeroed and off the phlebostatic axis: zero it (Z) and set its height to 0 cm with the controls on the monitor.'),
          el('label', { class: 'pick' }, el('input', { type: 'checkbox', checked: this.measureSelf, onchange: (e) => { this.measureSelf = e.target.checked; store.set('rhc.measureSelf', this.measureSelf); } }), ' I will read the pressures myself (caliper on the frozen trace)')),
        el('div', { class: 'checks' }, CHECKLIST.map(([id, text]) => el('button', { class: this.checks.has(id) ? 'right' : '', onclick: () => this.tick(id) }, `${this.checks.has(id) ? '✓' : '○'}  ${text}`))),
        el('div', {}, el('button', { class: 'primary', disabled: !all, onclick: () => this.begin() }, 'Begin'), ' ', el('button', { onclick: () => this.begin(true) }, 'Skip checklist')));
      return;
    }
    const rows = RECORD_SITES.map((s) => el('tr', { class: run.recorded[s] ? 'ok' : '' },
      el('td', {}, run.recorded[s] ? (run.flaws[s] ? '⚠' : '✓') : '○'), el('td', {}, SITES[s].short), el('td', {}, run.recorded[s] ? formatReading(run.recorded[s]) : '')));
    const o = outputs(sc, app.lab), d = derive(run.recorded, o.flowForPVR), v = vitals(sc, run.recorded.ra?.mean);
    const all = RECORD_SITES.every((s) => run.recorded[s]);
    const kids = [el('div', { class: 'grow' },
      el('h3', {}, this.game ? 'Diagnose the case' : `Do the RHC: ${sc.name}`),
      el('p', {}, this.done ? '' : this.game ? 'An unknown patient. Record each site (Enter), measure the output (T: thermodilution in the PA; D: blood samples), then choose the diagnosis.' : 'Record each site (Enter). Measure the cardiac output: T for thermodilution with the tip in the PA (three within 10%), D to draw a blood sample at each site for the saturation run and Fick.'),
      el('button', { class: 'primary', onclick: () => this.record(), disabled: this.done }, 'Record (Enter)')),
      el('table', { class: 'rec' }, rows)];
    if (this.form) {
      const inputs = {};
      kids.push(el('div', { class: 'measure' }, el('b', {}, `Your ${SITES[this.form.key].short} reading (mmHg):`),
        FIELDS[this.form.key].map(([f, label]) => el('label', {}, `${label} `, inputs[f] = el('input', { type: 'number', step: '1', inputmode: 'numeric', 'aria-label': label }))),
        el('button', { class: 'primary', onclick: () => this.submitForm(inputs) }, 'Save'), el('button', { onclick: () => { this.form = null; this.render(); } }, 'Cancel')));
      setTimeout(() => Object.values(inputs)[0]?.focus(), 0);
    }
    const lab = [
      el('tr', {}, el('td', {}, 'Cardiac output'), el('td', {}, o.co ? `${o.co.toFixed(2)} L/min (${o.method})${o.td.ok && (sc.id === 'tr' || sc.shunt) ? ', unreliable here' : ''}` : 'not measured yet (T or D)')),
      o.co ? el('tr', {}, el('td', {}, 'Cardiac index'), el('td', {}, `${(o.co / 1.9).toFixed(2)} L/min/m² (BSA 1.9)`)) : null,
      o.fick?.qpqs != null ? el('tr', {}, el('td', {}, 'Qp/Qs'), el('td', {}, `${o.fick.qpqs}${stepUps(app.lab.sats).length ? ` (step-up: ${stepUps(app.lab.sats).join(', ')})` : ''}`)) : null,
      el('tr', {}, el('td', {}, 'Arterial BP'), el('td', {}, `${v.sbp}/${v.dbp} (MAP ${v.map}), SpO₂ ${v.spo2}%`)),
      o.co && run.recorded.ra ? el('tr', {}, el('td', {}, 'SVR = (MAP − RAP) / CO'), el('td', {}, `${Math.round(((v.map - run.recorded.ra.mean) / o.co) * 10) / 10} WU (${Math.round(((v.map - run.recorded.ra.mean) / o.co) * 80)} dyn·s·cm⁻⁵)`)) : null,
    ];
    if (d) lab.push(
      el('tr', {}, el('td', {}, 'TPG = mPAP − PCWP'), el('td', {}, `${d.tpg} mmHg`)),
      el('tr', {}, el('td', {}, 'DPG = PAd − PCWP'), el('td', {}, `${d.dpg} mmHg`)),
      el('tr', {}, el('td', {}, `PVR = TPG / ${sc.shunt ? 'Qp' : 'CO'}`), el('td', {}, `${d.pvr} WU`)),
      d.papi != null ? el('tr', {}, el('td', {}, 'PAPi = (PAs − PAd) / RA'), el('td', {}, `${d.papi}`)) : null,
      el('tr', {}, el('td', {}, 'Interpretation'), el('td', {}, d.ph)));
    kids.push(el('table', { class: 'rec' }, lab));
    if (this.game && all && !this.done) {
      kids.push(el('div', { class: 'opts' }, el('b', {}, 'Your diagnosis:'),
        diagnosisOptions(sc.id).map((id) => el('button', { onclick: () => this.finish(id) }, scenario(id).name))));
    } else if (!this.game && all && !this.done) kids.push(el('button', { class: 'primary', onclick: () => this.finish() }, 'Finish and score'));
    if (this.done) {
      const r = this.result;
      kids.push(el('div', { class: 'grow' },
        el('div', { class: 'big' }, `${r.total}`, el('span', {}, ' / 100')),
        this.game ? el('p', {}, el('b', { class: run.diagnosis ? 'good' : 'bad' }, run.diagnosis ? 'Correct: ' : `Not quite (you chose ${scenario(diagnosis).name}). It was `), `${sc.name}. ${sc.summary}`) : null,
        el('ul', {}, r.notes.map((n) => el('li', {}, n))),
        el('button', { onclick: () => this.enter() }, this.game ? 'New case' : 'Again')));
    }
    app.panel.replaceChildren(...kids);
  }
  onKey(k) {
    if (this.form) return false;
    if (k === 'Enter') { this.record(); return true; }
    return false;
  }
}
