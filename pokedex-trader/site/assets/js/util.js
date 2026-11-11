// Petits outils partagés : DOM, formats français, stockage local tolérant aux erreurs.

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export const esc = s => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur0Fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const eur = v => v == null || v === '' || isNaN(v) ? '—' : eurFmt.format(Number(v));
export const eur0 = v => v == null || isNaN(v) ? '—' : eur0Fmt.format(Number(v));
export const num = (v, d = 0) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });
/** Variation en couleur : v = 0.12 -> +12,0 % (mul = 1 si v est déjà en %) */
export const pc = (v, mul = 100) => v == null || isNaN(v) ? '—' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${(v * mul).toFixed(1).replace('.', ',')} %</span>`;
export const pcPlain = (v, mul = 100) => v == null || isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * mul).toFixed(1).replace('.', ',')} %`;
export const sg = v => v == null || isNaN(v) ? '—' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${eur(v)}</span>`;
export const fdate = d => { if (!d) return '—'; const x = new Date(d.length === 10 ? d + 'T12:00:00' : d); return isNaN(x) ? '—' : x.toLocaleDateString('fr-FR'); };
export const fdatetime = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); };
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** localStorage / sessionStorage : jamais d'exception (navigation privée, stockage bloqué…) */
export const store = {
  get(k, def = null, s = 'local') { try { const v = (s === 'local' ? localStorage : sessionStorage).getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v, s = 'local') { try { (s === 'local' ? localStorage : sessionStorage).setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k, s = 'local') { try { (s === 'local' ? localStorage : sessionStorage).removeItem(k); } catch (e) { /* rien */ } },
};

export function toast(text, kind = '') {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  box.append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6500 : 3800);
}

export function errText(e) {
  const m = e?.message || e?.error_description || e?.msg || String(e || 'Erreur inconnue');
  if (/row-level security|42501|permission denied/i.test(m) && !/modérateur|admin|propre|Résiliez/i.test(m)) return 'Action non autorisée pour votre compte.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion impossible. Vérifiez votre réseau.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Confirmez d\'abord votre adresse e-mail (lien reçu par e-mail).';
  if (/User already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse.';
  if (/Password should be/i.test(m)) return 'Mot de passe trop court (8 caractères minimum).';
  return m;
}

export function download(name, text, type = 'text/plain') {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (e) { toast('Téléchargement impossible sur cet affichage.', 'err'); return false; }
}

export const csvCell = v => { const s = (v ?? '').toString(); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCSV = rows => '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\n');

export function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

/** Numéro de carte -> clé de tri ("4", "TG12", "001/032", "17_A") */
export function numKey(n) {
  const s = (n || '').toString();
  const m = s.match(/^([A-Za-z]*)(\d+)/);
  return m ? [m[1].toUpperCase(), +m[2], s] : ['~', 0, s];
}
export function byNumber(a, b) {
  const x = numKey(a.number), y = numKey(b.number);
  return x[0].localeCompare(y[0]) || x[1] - y[1] || x[2].localeCompare(y[2]);
}

export const ICONS = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  medal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="15" r="6"/><path d="M8.5 10.5L5 3h4l3 5 3-5h4l-3.5 7.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
};

/** Photo de profil (membres Pro) : formats et poids acceptés */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif'], AVATAR_MAX = 2 * 1024 * 1024;

/** Même carte dans une autre langue : la carte anglaise fait le lien (une FR la désigne par ref_id, une JP porte son nom anglais
 *  et sa date de sortie). Entre plusieurs candidates, celle du même numéro, sinon la première. Renvoie son id ou null. */
export function pickSibling(list, num) {
  if (!list?.length) return null;
  const n = parseInt(num, 10);
  return (list.find(x => parseInt(x.number, 10) === n) || [...list].sort((a, b) => a.id.localeCompare(b.id))[0]).id;
}
