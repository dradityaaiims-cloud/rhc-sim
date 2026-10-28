// Free explore: pick a scenario and access, drive the catheter, watch the waves.
import { el } from '../ui/dom.js';
import { SCENARIOS } from '../sim/hemo.js';
import { ACCESS } from '../sim/catheter.js';
import { ARTEFACTS } from '../sim/artifacts.js';

export class ExploreMode {
  constructor(app) { this.app = app; this.id = 'explore'; }
  enter() {
    const { app } = this;
    const sel = el('select', { 'aria-label': 'Scenario', onchange: (e) => { app.setScenario(e.target.value); app.flags.changedScenario = true; e.target.blur(); } },
      SCENARIOS.map((s) => el('option', { value: s.id }, s.name)));
    sel.value = app.sc.id;
    const acc = el('select', { 'aria-label': 'Access', onchange: (e) => { app.setAccess(e.target.value); e.target.blur(); } },
      Object.entries(ACCESS).map(([k, a]) => el('option', { value: k }, a.name)));
    acc.value = app.cath.access;
    const br = el('select', { 'aria-label': 'Breathing', onchange: (e) => { app.vent = e.target.value === 'vent'; e.target.blur(); } },
      el('option', { value: 'spont' }, 'Spontaneous'), el('option', { value: 'vent' }, 'Ventilator'));
    br.value = app.vent ? 'vent' : 'spont';
    const art = el('select', { 'aria-label': 'Artefact', onchange: (e) => { app.cath.setArtefact(e.target.value); e.target.blur(); } },
      Object.entries(ARTEFACTS).map(([k, a]) => el('option', { value: k }, a.name)));
    art.value = app.cath.artefact;
    const rh = el('select', { 'aria-label': 'Rhythm', onchange: (e) => { app.afOverride = e.target.value === 'af'; e.target.blur(); } },
      el('option', { value: 'sinus' }, 'Sinus'), el('option', { value: 'af' }, 'Atrial fibrillation'));
    this.rh = rh;
    this.sum = el('p', {});
    app.panel.replaceChildren(
      el('div', { class: 'grow' }, el('h3', {}, 'Free explore'), this.sum),
      el('label', { class: 'pick' }, 'Scenario ', sel), el('label', { class: 'pick' }, 'Access ', acc), el('label', { class: 'pick' }, 'Breathing ', br),
      el('label', { class: 'pick' }, 'Rhythm ', rh), el('label', { class: 'pick' }, 'Artefact ', art));
    this.afterScenario();
  }
  afterScenario() { this.sum.textContent = this.app.sc.summary; this.rh.value = this.app.af ? 'af' : 'sinus'; }
  exit() {}
  update() {}
}
