// Guided tour: spotlight + card. A step = {title, text, target?, rect?, enter?, done?, tryText?}
//   target: CSS selector to highlight; rect: () => {left,top,width,height} for custom regions;
//   enter: run when the step opens; done: polled predicate for "try it" steps (shows a tick).
// ←/→ move between steps, Esc ends. Sim keys still work underneath so "try it" steps are real.
import { el } from './dom.js';

export function startTour(steps, { onEnd } = {}) {
  let i = 0, poll = null;
  const hole = el('div', { class: 'tour-hole' });
  const card = el('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite' });
  const overlay = el('div', { class: 'tour' }, hole, card);
  document.body.append(overlay);

  const rectOf = (s) => {
    if (s.rect) return s.rect();
    const t = s.target && document.querySelector(s.target);
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return r.width ? r : null;
  };

  function place() {
    const s = steps[i], r = rectOf(s), pad = 6;
    if (r) {
      Object.assign(hole.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
      overlay.classList.remove('dim');
    } else { hole.style.display = 'none'; overlay.classList.add('dim'); }
    const cw = card.offsetWidth, ch = card.offsetHeight, W = innerWidth, H = innerHeight;
    let x = (W - cw) / 2, y = (H - ch) / 2;
    if (r) {
      const below = r.top + r.height + pad + 12 + ch < H, above = r.top - pad - 12 - ch > 0;
      if (below) y = r.top + r.height + pad + 12; else if (above) y = r.top - pad - 12 - ch;
      else { y = Math.max(8, H - ch - 12); }
      x = Math.min(Math.max(8, r.left + r.width / 2 - cw / 2), W - cw - 8);
      // a very tall target (e.g. a whole pane): sit inside its lower-left corner instead
      if (!below && !above) x = Math.min(Math.max(8, r.left + 12), W - cw - 8);
    }
    Object.assign(card.style, { left: `${x}px`, top: `${Math.max(8, y)}px` });
  }

  function show() {
    const s = steps[i];
    clearInterval(poll);
    s.enter?.();
    const tick = el('div', { class: 'tour-try' });
    if (s.tryText) tick.textContent = `Try it: ${s.tryText}`;
    card.replaceChildren(...[
      el('div', { class: 'tour-step' }, `${i + 1} / ${steps.length}`),
      el('h4', {}, s.title),
      el('p', {}, s.text),
      s.tryText ? tick : null,
      el('div', { class: 'tour-btns' },
        el('button', { onclick: end }, 'Skip'),
        el('span', { class: 'sp' }),
        i > 0 ? el('button', { onclick: () => go(-1) }, 'Back') : null,
        el('button', { class: 'primary', onclick: () => (i === steps.length - 1 ? end() : go(1)) }, i === steps.length - 1 ? 'Finish' : 'Next'))].filter(Boolean));
    if (s.done) poll = setInterval(() => { if (s.done()) { tick.textContent = `✓ ${s.tryText}`; tick.classList.add('ok'); clearInterval(poll); } }, 250);
    requestAnimationFrame(place);
  }
  const go = (d) => { i = Math.min(steps.length - 1, Math.max(0, i + d)); show(); };
  function end() {
    clearInterval(poll);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    overlay.remove();
    onEnd?.();
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); i === steps.length - 1 ? end() : go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  show();
  return { end };
}
