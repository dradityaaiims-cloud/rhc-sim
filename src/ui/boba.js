// Boba, the assistant dog (reused from the ventilator simulator): bottom-right, animated,
// gives context-aware tips. Rules live in bobaRules.js. Assets: public/assets/boba.webp.
import { nextRule, GENERAL } from './bobaRules.js';

export function initBoba({ getCtx, onTour, onLearn }) {
  const KEY = 'rhc-boba-quiet';
  let quiet = false; try { quiet = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }
  const fired = new Map(), asked = new Map(); // asked: tips already shown to this click/"Another tip" run
  let lastProactive = Date.now() - 30e3, generalIdx = Math.floor(Math.random() * GENERAL.length);
  let hideTimer = null, lastActive = Date.now(), asleep = false;

  const root = document.createElement('div'); root.id = 'boba'; root.className = 'boba';
  root.innerHTML = `
    <div class="boba-bubble" role="status" aria-live="polite" hidden>
      <button class="boba-x" aria-label="Close tip">x</button>
      <div class="boba-text"></div>
      <div class="boba-btns"></div>
    </div>
    <button class="boba-dog" aria-label="Boba, your assistant dog. Press for a tip." title="Click me for a tip. Double-click for zoomies.">
      <img src="${import.meta.env.BASE_URL}assets/boba.webp" alt="" width="120" height="120" draggable="false">
      <span class="boba-zzz" aria-hidden="true">z z z</span>
    </button>`;
  document.body.append(root);
  const bubble = root.querySelector('.boba-bubble'), text = root.querySelector('.boba-text'), btns = root.querySelector('.boba-btns');
  const dog = root.querySelector('.boba-dog');

  const anim = (cls, ms) => { dog.classList.remove('wag', 'hop', 'zoom'); void dog.offsetWidth; dog.classList.add(cls); setTimeout(() => dog.classList.remove(cls), ms); };
  const wake = () => { lastActive = Date.now(); if (asleep) { asleep = false; dog.classList.remove('nap'); say("Woof! I'm awake.", [], 3000); anim('hop', 500); } };

  function say(msg, extras = [], autoHide = 0) {
    text.textContent = msg; btns.replaceChildren();
    const mk = (label, fn, cls = '') => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = (e) => { e.stopPropagation(); fn(); }; btns.append(b); };
    for (const [label, fn, cls] of extras) mk(label, fn, cls);
    mk('Another tip', () => tip(true));
    mk('Tour', () => { close(); onTour(); });
    mk('Learn', () => { close(); onLearn(); });
    mk(quiet ? 'Unmute' : 'Hush', () => { quiet = !quiet; try { localStorage.setItem(KEY, quiet ? '1' : '0'); } catch { /* */ } say(quiet ? 'Okay, I will stay quiet. Click me any time.' : 'Yay! I will chime in when I notice something.', [], 4000); });
    bubble.hidden = false; anim('wag', 900);
    clearTimeout(hideTimer); if (autoHide) hideTimer = setTimeout(close, autoHide);
  }
  function close() { bubble.hidden = true; clearTimeout(hideTimer); asked.clear(); }

  // a tip for the current situation if one applies, otherwise the next general tip
  function tip(forceNew = false) {
    const ctx = getCtx(), now = Date.now();
    // a fresh Map here made "Another tip" return the same first matching rule every time
    const r = nextRule(ctx, forceNew ? asked : fired, now);
    if (r) { fired.set(r.key, now); asked.set(r.key, now); return say(r.text(ctx)); }
    generalIdx = (generalIdx + 1) % GENERAL.length; say(GENERAL[generalIdx]);
  }

  dog.addEventListener('click', () => { wake(); bubble.hidden ? tip(true) : close(); });
  dog.addEventListener('dblclick', () => { anim('zoom', 1400); say('Zoomies!', [], 2500); });
  root.querySelector('.boba-x').onclick = close;
  for (const ev of ['mousemove', 'keydown', 'pointerdown']) window.addEventListener(ev, () => { if (asleep) wake(); lastActive = Date.now(); }, { passive: true });

  // proactive tips, napping and idle antics
  setInterval(() => {
    const now = Date.now();
    if (document.querySelector('.tour-card') || document.body.classList.contains('learning')) return;
    if (!asleep && now - lastActive > 180e3) { asleep = true; dog.classList.add('nap'); close(); return; }
    if (asleep) return;
    if (!quiet && bubble.hidden && now - lastProactive > 40e3) {
      const r = nextRule(getCtx(), fired, now);
      if (r) { fired.set(r.key, now); lastProactive = now; say(r.text(getCtx()), [], 16000); return; }
    }
    if (bubble.hidden && Math.random() < 0.18) anim(Math.random() < 0.6 ? 'wag' : 'hop', 900);
  }, 4000);

  // greet a new visitor once
  setTimeout(() => { if (document.querySelector('.tour')) return; say("Hi, I'm Boba! Click me for tips, or let me show you around. I'll chime in when I notice something.", [['Show me around', () => { close(); onTour(); }, 'primary']], 14000); }, 2500);
  return { say, tip };
}
