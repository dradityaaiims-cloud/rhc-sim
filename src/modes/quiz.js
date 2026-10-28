// "Name that waveform": the catheter is hidden; identify the site from the trace alone.
import { el } from '../ui/dom.js';
import { SITES, scenario } from '../sim/hemo.js';
import { waveformQuestion } from './scoring.js';

const WHY = {
  ra: 'Low pressure with small a and v waves (two bumps per beat) and x and y descents: an atrial trace. Before the tricuspid valve, so it is the RA.',
  rv: 'Systolic pressure like the PA, but diastolic falls near zero and then rises through diastole to the end-diastolic pressure. No dicrotic notch.',
  pa: 'Systolic like the RV, but diastolic is held up (the pulmonary valve is closed) and falls slowly, with a dicrotic notch on the downstroke.',
  pcw: 'An atrial-type trace again (a and v waves) but later after the ECG than the RA waves, and its mean is below the PA diastolic: the balloon is wedged.',
};

export class QuizMode {
  constructor(app) { this.app = app; this.id = 'quiz'; this.score = { right: 0, n: 0 }; }
  locked() { return true; }
  enter() { this.app.setQuiz(true); this.next(); }
  exit() { this.app.setQuiz(false); }
  next() {
    const q = this.q = { ...waveformQuestion(), answered: false };
    this.t0 = Date.now();
    this.app.setScenario(q.scenarioId, { keepPanel: true });
    this.app.placeAt(q.site);
    this.say = el('p', {}, 'Where is the catheter tip? Look at the diastolic pressure first, then the shape. The diagnosis is hidden too.');
    this.btns = q.options.map((s, i) => el('button', { onclick: () => this.answer(s) }, `${i + 1}  ${SITES[s].name}`));
    this.app.panel.replaceChildren(
      el('div', { class: 'grow' }, el('h3', {}, 'Name that waveform'), this.say),
      el('div', { class: 'opts' }, this.btns),
      el('div', { class: 'stats' }, `Score ${this.score.right} / ${this.score.n}`));
  }
  answer(site) {
    const q = this.q; if (q.answered) return; q.answered = true;
    const ok = site === q.site; this.score.n++; if (ok) this.score.right++;
    q.options.forEach((s, i) => this.btns[i].classList.add(s === q.site ? 'right' : s === site ? 'wrong' : 'x'));
    this.say.replaceChildren(el('b', { class: ok ? 'good' : 'bad' }, ok ? 'Correct. ' : `It was the ${SITES[q.site].name}. `),
      `${WHY[q.site]} Case: ${scenario(q.scenarioId).name}.`);
    this.app.panel.append(el('button', { class: 'primary', onclick: () => this.next() }, 'Next (Enter)'));
    this.app.setQuiz(false, { keepCatheterHidden: true });
  }
  onKey(k) {
    if (!this.q) return false;
    if (!this.q.answered && '1234'.includes(k)) { this.answer(this.q.options[Number(k) - 1]); return true; }
    if (this.q.answered && k === 'Enter') { this.app.setQuiz(true); this.next(); return true; }
    return false;
  }
  update() {}
}
