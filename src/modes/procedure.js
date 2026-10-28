// "Do the RHC" (navigate): float the catheter, record RA, RV, PA and PCW, get the haemodynamics.
// "Diagnose the case" (game): the same run on a hidden scenario, then name the diagnosis.
import { el } from '../ui/dom.js';
import { SCENARIOS, SITES, scenario, formatReading, derive } from '../sim/hemo.js';
import { ARTEFACTS } from '../sim/artifacts.js';
import { RECORD_SITES, scoreRun, diagnosisOptions } from './scoring.js';

export class ProcedureMode {
  constructor(app, { game = false } = {}) { this.app = app; this.game = game; this.id = game ? 'case' : 'procedure'; }
  enter() {
    const { app } = this;
    if (this.game) app.setScenario(SCENARIOS.filter((s) => s.id !== 'normal')[Math.floor(Math.random() * (SCENARIOS.length - 1))].id, { keepPanel: true });
    app.cath.reset();
    // a real case can come with a monitoring problem to spot and fix
    if (this.game && Math.random() < 0.5) app.cath.setArtefact(['whip', 'over', 'under'][Math.floor(Math.random() * 3)]);
    this.run = { recorded: {}, blocked: 0, pullbacks: 0, flushWedged: 0, wedgeMax: 0, secs: 0, flaws: {} };
    this.done = false;
    this.render();
  }
  exit() {}
  record() {
    const site = this.app.cath.site, key = site === 'puw' || site === 'ow' ? 'pcw' : site;
    if (this.done) return;
    if (!RECORD_SITES.includes(key)) { this.app.notice('Record in the RA, RV, PA or wedge position.'); return; }
    const m = this.app.reading(site), art = this.app.cath.artefact;
    // the monitor records what it shows; a bad wedge or an uncorrected artefact is kept, and flagged at the end
    this.run.recorded[key] = m;
    if (key !== site) this.run.flaws[key] = `${SITES[site].real}: the wedge you recorded was not valid.`;
    else if (art !== 'none' && !(art === 'whip' && site !== 'pa' && site !== 'rv')) this.run.flaws[key] = `${ARTEFACTS[art].name} trace when you recorded the ${SITES[key].short}. ${ARTEFACTS[art].fix}`;
    else delete this.run.flaws[key];
    this.app.flags.recorded = true;
    this.render();
  }
  onEvent(kind) { if (!this.done && kind in this.run) this.run[kind]++; }
  update(dt) {
    if (this.done) return;
    this.run.secs += dt;
    this.run.wedgeMax = Math.max(this.run.wedgeMax, this.app.cath.wedgeSecs);
  }
  finish(diagnosis) {
    this.done = true;
    if (this.game) this.run.diagnosis = diagnosis === this.app.sc.id;
    this.result = scoreRun(this.run);
    this.render(diagnosis);
  }
  render(diagnosis) {
    const { app, run } = this, sc = app.sc;
    const rows = RECORD_SITES.map((s) => el('tr', { class: run.recorded[s] ? 'ok' : '' },
      el('td', {}, run.recorded[s] ? '✓' : '○'), el('td', {}, SITES[s].short), el('td', {}, run.recorded[s] ? formatReading(run.recorded[s]) : '')));
    const d = derive(run.recorded, sc.co);
    const all = RECORD_SITES.every((s) => run.recorded[s]);
    const kids = [el('div', { class: 'grow' },
      el('h3', {}, this.game ? 'Diagnose the case' : `Do the RHC: ${sc.name}`),
      el('p', {}, this.done ? '' : this.game ? 'An unknown patient. Float the catheter, record each site with Enter, then choose the diagnosis.' : 'Inflate the balloon in the RA, float to the wedge, and press Enter (or Record) at each site. Deflate before you pull back.'),
      el('button', { class: 'primary', onclick: () => this.record(), disabled: this.done }, 'Record (Enter)')),
      el('table', { class: 'rec' }, rows)];
    if (d) kids.push(el('table', { class: 'rec' },
      el('tr', {}, el('td', {}, 'Cardiac output'), el('td', {}, `${sc.co.toFixed(1)} L/min (thermodilution, given${sc.id === 'tr' ? '; unreliable in severe TR' : ''})`)),
      el('tr', {}, el('td', {}, 'TPG = mPAP − PCWP'), el('td', {}, `${d.tpg} mmHg`)),
      el('tr', {}, el('td', {}, 'DPG = PAd − PCWP'), el('td', {}, `${d.dpg} mmHg`)),
      el('tr', {}, el('td', {}, 'PVR = TPG / CO'), el('td', {}, `${d.pvr} WU`)),
      d.papi != null ? el('tr', {}, el('td', {}, 'PAPi = (PAs − PAd) / RA'), el('td', {}, `${d.papi}`)) : null,
      el('tr', {}, el('td', {}, 'Interpretation'), el('td', {}, d.ph))));
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
  onKey(k) { if (k === 'Enter') { this.record(); return true; } return false; }
}
