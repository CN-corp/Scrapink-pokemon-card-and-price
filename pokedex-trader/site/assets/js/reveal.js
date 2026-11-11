// Découverte Pro : un compte gratuit voit directement toutes les stats Pro des 5 premières cartes qu'il ouvre
// (réglage free_reveals, sans message qui l'explique). À partir de la 6e carte, et pour les visiteurs sans compte,
// une Poké Ball au petit cadenas jaune et un texte court remplacent les stats Pro et mènent à l'inscription ou à
// l'abonnement. Les vraies règles sont en base : reveal_card / reveal_status (schema.sql, section 16).
import { esc, eur, pcPlain } from './util.js';
import { S, tier, hasPro, setting } from './state.js';

let status = null; // { limit, used, cards: [] } du compte connecté
export function resetReveals() { status = null; }
export async function loadRevealStatus() {
  if (!S.user || hasPro()) return null;
  if (!status) {
    try { status = await S.api.revealStatus(); }
    catch (e) { status = { limit: +setting('free_reveals', 5) || 5, used: 0, cards: [] }; }
  }
  return status;
}
export const isRevealed = id => !!status?.cards?.includes(id);
export const revealLimit = () => status?.limit ?? (+setting('free_reveals', 5) || 5);
export const revealsLeft = () => status ? Math.max(0, status.limit - status.used) : revealLimit();
export function noteReveal(id, r) {
  if (!status) return;
  if (!status.cards.includes(id)) status.cards.push(id);
  status.used = r?.used ?? status.cards.length;
  if (r?.limit != null) status.limit = r.limit;
}

/** Poké Ball avec un petit cadenas jaune (le cadenas s'envole à l'ouverture) */
export function pokeLock(cls = '') {
  return `<svg class="pball ${cls}" viewBox="0 0 48 48" aria-hidden="true">
    <g class="pb-ball"><g class="pb-top"><path d="M4 24a20 20 0 0 1 40 0z" fill="#e3350d"/><path d="M9 16a16 16 0 0 1 9-7" stroke="#ffffff8c" stroke-width="3" stroke-linecap="round" fill="none"/></g>
      <path d="M4 24a20 20 0 0 0 40 0z" fill="#fff"/><circle cx="24" cy="24" r="20" fill="none" stroke="#171a2b" stroke-width="3"/>
      <path d="M4 24h40" stroke="#171a2b" stroke-width="3"/><circle cx="24" cy="24" r="6" fill="#fff" stroke="#171a2b" stroke-width="3"/><circle class="pb-btn" cx="24" cy="24" r="2.4" fill="#d9dcea"/></g>
    <g class="pb-pad"><path d="M33.5 31v-3.5a4.5 4.5 0 0 1 9 0V31" fill="none" stroke="#8a5f00" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="30.5" y="30" width="15" height="12" rx="2.6" fill="#ffcb05" stroke="#8a5f00" stroke-width="2"/><circle cx="38" cy="35.2" r="1.6" fill="#8a5f00"/><path d="M38 36.2v2.6" stroke="#8a5f00" stroke-width="1.6" stroke-linecap="round"/></g></svg>`;
}

/** À la place des stats Pro sur la fiche carte : la Poké Ball et un texte court, vers l'inscription (sans compte)
 *  ou l'abonnement (compte gratuit dont les 5 cartes sont passées) */
export function lockRow() {
  const href = tier() === 'anon' ? '#/inscription?offre=pro' : '#/abonnement';
  return `<a class="plock-row" href="${href}" aria-label="Stats Pro : ${esc(LOCK_CAP)}">${pokeLock()}
    <span class="plock-txt"><b>Stats Pro</b><span>Accès aux statistiques professionnelles pour trader la classe d'actifs</span></span></a>`;
}
const LOCK_CAP = "Accès aux statistiques professionnelles pour trader la classe d'actifs";

/** Nombre qui défile de 0 à sa valeur (data-cu = valeur, data-k = eur | pct) */
export const cu = (v, k = 'eur') => v == null || isNaN(v) ? '—' : `<span data-cu="${+v}" data-k="${k}">${k === 'pct' ? pcPlain(v) : eur(v)}</span>`;
export function countUp(root, ms = 900) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const els = [...root.querySelectorAll('[data-cu]')];
  const t0 = performance.now();
  const fmt = (el, v) => { el.textContent = el.dataset.k === 'pct' ? pcPlain(v) : eur(v); };
  const step = now => {
    const f = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - f, 3);
    for (const el of els) fmt(el, +el.dataset.cu * e);
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Animation d'ouverture de la Poké Ball (≈ 1,1 s ; immédiate si l'utilisateur limite les animations) */
export function playOpen(btn) {
  if (!btn || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  btn.classList.add('opening');
  btn.disabled = true;
  return new Promise(r => setTimeout(r, 1150));
}
