// Animation d'ouverture : la Poké Ball tombe, tremble trois fois, le bouton s'illumine, elle s'ouvre.
// ~2,2 s, une fois par session, interrompue par un clic ou une touche, instantanée si l'utilisateur
// a demandé moins d'animations (prefers-reduced-motion).
import { store } from './util.js';

const INTRO_MS = 2200;

export function runIntro() {
  const el = document.getElementById('intro');
  const root = document.documentElement;
  if (!el || root.classList.contains('no-intro')) { root.classList.remove('intro-on'); el?.remove(); return Promise.resolve('skipped'); }
  store.set('pt-intro', 1, 'session');
  return new Promise(resolve => {
    let done = false;
    const finish = how => {
      if (done) return;
      done = true;
      root.classList.remove('intro-on');
      window.removeEventListener('keydown', onKey, true);
      el.classList.add('skip');
      setTimeout(() => { el.remove(); resolve(how); }, how === 'end' ? 0 : 200);
    };
    const onKey = e => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) finish('skip'); };
    el.addEventListener('pointerdown', () => finish('skip'));
    window.addEventListener('keydown', onKey, true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('fade');           // fondu immédiat (transition courte en CSS)
      setTimeout(() => finish('reduced'), 380);
      return;
    }
    setTimeout(() => finish('end'), INTRO_MS);
  });
}
