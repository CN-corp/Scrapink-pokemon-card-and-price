// Actualités du Pokémon TCG : bandeau défilant sous l'en-tête et page #/actus.
// Trois sources : les actualités publiées (flux RSS relevés par la synchro, ou saisies par la modération),
// les sorties d'extensions (dates du catalogue) et l'opportunité du jour (aperçu public du marché).
import { $, esc, eur, fdate, store } from '../util.js';
import { S } from '../state.js';
import { loadSets } from './catalog.js';

const KIND = { news: 'Actu', release: 'Sortie', event: 'Événement', site: 'Pokédex Trader', market: 'Marché' };
const DAY = 864e5;

/** Toutes les entrées, les plus récentes d'abord : { kind, title, url?, href?, source?, lang?, date } */
export async function newsItems(lim = 20) {
  const [news, sets, teaser] = await Promise.all([S.api.news(lim).catch(() => []), loadSets().catch(() => []), S.api.teaser().catch(() => [])]);
  const now = Date.now(), out = [];
  for (const n of news) out.push({ kind: n.kind || 'news', title: n.title, url: n.url, source: n.source, lang: n.lang, date: n.published_at });
  // Sorties : extensions d'au moins 30 cartes (pas les petits lots promo), 6 au plus
  let nRel = 0;
  for (const s of [...sets].sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))) {
    if (!s.release_date || (s.total || 0) < 30 || nRel >= 6) continue;
    const t = new Date(s.release_date + 'T12:00:00').getTime();
    if (t > now && t - now < 120 * DAY) out.push({ kind: 'release', title: `Bientôt : ${s.name}, sortie le ${fdate(s.release_date)}`, href: `#/collections/${encodeURIComponent(s.id)}`, lang: s.lang, date: new Date(now).toISOString(), soon: true }), nRel++;
    else if (t <= now && now - t < 75 * DAY) out.push({ kind: 'release', title: `Nouvelle extension : ${s.name}${s.lang && s.lang !== 'EN' ? ` (${s.lang})` : ''}, sortie le ${fdate(s.release_date)}`, href: `#/collections/${encodeURIComponent(s.id)}`, lang: s.lang, date: new Date(t).toISOString() }), nRel++;
  }
  const top = teaser[0];
  if (top) out.push({ kind: 'market', title: `Opportunité du jour : ${top.name} (${top.set_name || ''}), ${top.signal ? `signal ${top.signal} à ` : ''}${eur(top.price)}`, href: `#/carte/${encodeURIComponent(top.card_id)}`, date: new Date(now).toISOString() });
  return out.sort((a, b) => (b.soon ? 1 : 0) - (a.soon ? 1 : 0) || (b.date || '').localeCompare(a.date || ''));
}

const itemLink = (i, cls = '') => {
  const tag = `<span class="nk k-${esc(i.kind)}">${esc(KIND[i.kind] || 'Actu')}</span>`;
  const txt = `${tag}<span class="nt">${esc(i.title)}</span>${i.source && i.kind !== 'site' ? `<span class="ns">${esc(i.source)}</span>` : ''}`;
  if (i.url) return `<a class="${cls}" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${txt}<span class="sr-only"> (nouvel onglet)</span></a>`;
  if (i.href) return `<a class="${cls}" href="${esc(i.href)}">${txt}</a>`;
  return `<span class="${cls}">${txt}</span>`;
};

/** Bandeau défilant (masquable pour la session). Pause au survol et au clavier ; sans animation si l'utilisateur la refuse. */
export async function renderTicker() {
  let bar = $('#ticker');
  if (store.get('pt-ticker-hidden', false, 'session')) { bar?.remove(); return; }
  let items = [];
  try { items = (await newsItems(15)).slice(0, 14); } catch (e) { items = []; }
  if (!items.length) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'ticker'; bar.className = 'ticker';
    bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Actualités du Pokémon TCG');
    $('#site-header').after(bar);
  }
  const list = items.map(i => itemLink(i, 'ti')).join('<span class="sep" aria-hidden="true">•</span>');
  bar.innerHTML = `<div class="wrap tk"><a class="tk-label" href="#/actus">Actus TCG</a>
    <div class="tk-view"><div class="tk-track" style="--tk-dur:${Math.max(30, items.length * 7)}s"><div class="tk-set">${list}</div><div class="tk-set" aria-hidden="true">${list.replace(/<a /g, '<a tabindex="-1" ')}</div></div></div>
    <button class="icon-btn tk-x" type="button" aria-label="Masquer le bandeau d'actualités">✕</button></div>`;
  bar.querySelector('.tk-x').addEventListener('click', () => { store.set('pt-ticker-hidden', true, 'session'); bar.remove(); });
}

export async function renderNews(el) {
  el.innerHTML = `<div class="page-title"><div><h1>Actualités du Pokémon TCG</h1><p class="sub">Sorties d'extensions, nouvelles du jeu de cartes et annonces du site. Les articles s'ouvrent sur le site de leur auteur.</p></div></div>
    <section class="panel"><div class="form"><label for="nw-k">Afficher<select id="nw-k"><option value="">Tout</option>${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label for="nw-l">Langue<select id="nw-l"><option value="">Toutes</option><option value="FR">Français</option><option value="EN">Anglais</option><option value="JP">Japonais</option></select></label></div>
      <div id="nw-list"><div class="sub">Chargement…</div></div></section>`;
  let items = [];
  try { items = await newsItems(60); } catch (e) { items = []; }
  const draw = () => {
    const k = $('#nw-k')?.value, l = $('#nw-l')?.value, box = $('#nw-list'); if (!box) return;
    const rows = items.filter(i => (!k || i.kind === k) && (!l || !i.lang || i.lang === l));
    box.innerHTML = rows.length ? `<ul class="news-list">${rows.map(i => `<li><span class="meta">${i.soon ? 'À venir' : fdate(i.date)}</span>${itemLink(i)}</li>`).join('')}</ul>`
      : '<div class="empty">Aucune actualité pour ce filtre. Les nouvelles arrivent avec la synchronisation de chaque matin.</div>';
  };
  el.addEventListener('change', e => { if (e.target.closest('#nw-k,#nw-l')) draw(); });
  draw();
}
