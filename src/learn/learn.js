// Learn tab: sidebar of sections + rendered content. `onGoto(id)` opens a scenario or site in the simulator.
import { el } from '../ui/dom.js';
import { SECTIONS } from './content.js';

function renderBlock(b, onGoto) {
  if (b.p) return el('p', {}, b.p);
  if (b.h) return el('h3', {}, b.h);
  if (b.ul) return el('ul', {}, b.ul.map((t) => el('li', {}, t)));
  if (b.note) return el('div', { class: 'callout' }, b.note);
  if (b.table) {
    const { head, rows, go } = b.table;
    return el('div', { class: 'tbl' }, el('table', {},
      el('thead', {}, el('tr', {}, head.map((h, j) => (j === go ? el('th', {}) : el('th', {}, h))))),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, j) => el('td', {}, j === go ? el('button', { class: 'mini', onclick: () => onGoto(c) }, 'Show in sim') : c)))))));
  }
  return null;
}

export function initLearn({ root, onGoto, onTour }) {
  const nav = el('nav', { class: 'learn-nav', 'aria-label': 'Learning sections' });
  const body = el('article', { class: 'learn-body' });
  root.replaceChildren(nav, body);
  const buttons = {};

  function open(id) {
    const sec = SECTIONS.find((s) => s.id === id) || SECTIONS[0];
    for (const [k, b] of Object.entries(buttons)) b.classList.toggle('active', k === sec.id);
    const i = SECTIONS.indexOf(sec);
    body.replaceChildren(...[
      el('h2', {}, sec.title),
      sec.id === 'start' ? el('button', { class: 'primary', onclick: onTour }, 'Start the guided tour') : null,
      ...sec.blocks.map((b) => renderBlock(b, onGoto)),
      el('div', { class: 'learn-pager' },
        i > 0 ? el('button', { onclick: () => open(SECTIONS[i - 1].id) }, `← ${SECTIONS[i - 1].title}`) : el('span'),
        i < SECTIONS.length - 1 ? el('button', { onclick: () => open(SECTIONS[i + 1].id) }, `${SECTIONS[i + 1].title} →`) : el('span'))].filter(Boolean));
    body.scrollTop = 0;
    try { localStorage.setItem('rhc.learn.section', sec.id); } catch { /* ignore */ }
  }

  for (const s of SECTIONS) {
    buttons[s.id] = el('button', { onclick: () => open(s.id) }, s.title);
    nav.append(buttons[s.id]);
  }
  let last = 'start';
  try { last = localStorage.getItem('rhc.learn.section') || 'start'; } catch { /* ignore */ }
  open(last);
  return { open };
}
