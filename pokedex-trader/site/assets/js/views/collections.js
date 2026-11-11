// Collections : la porte d'entrée visuelle des nouveaux venus (gratuite, sans compte).
// Grille des extensions (logo, année, série, carte phare), puis page d'une extension : ses cartes de la plus
// rare à la plus commune, avec la chance de tirage ESTIMÉE (voir pullrates.js) et la cote du jour.
// Un clic sur une carte ouvre sa fiche (views/card.js).
import { $, esc, eur, num, norm, debounce, store, errText, ICONS } from '../util.js';
import { S, setting } from '../state.js';
import { LANGS, langTag, langNote, frame, thumb, spriteBg } from '../ui.js';
import { productGrid } from './produits.js';
import { loadSets, loadSetCards } from './catalog.js';
import { dropTable, fmtCard, fmtTier, DROP_HELP } from '../pullrates.js';

const COL = { q: '', series: '', sort: 'date' };
const SETV = { sort: 'rarity', view: store.get('pt-col-view', 'grid') === 'list' ? 'list' : 'grid', q: '' };
export const PACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 4l2-1.2L10 4l2-1.2L14 4l2-1.2L18 4v16l-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2L6 20z"/><path d="M9.5 10.5h5M9.5 13.5h5"/></svg>';

// Teintes des dégradés par série (deux teintes HSL), dans l'esprit de la palette du site
const HUES = { 'Méga-Évolution': [262, 318], 'Écarlate et Violet': [352, 272], 'Épée et Bouclier': [214, 350], 'Soleil et Lune': [28, 196],
  'XY': [222, 4], 'Noir et Blanc': [232, 196], 'HeartGold SoulSilver': [44, 214], 'Platine': [210, 280], 'Diamant et Perle': [198, 318],
  'EX': [8, 38], 'POP': [48, 8], 'Base': [48, 8], 'Gym': [20, 48], 'Neo': [170, 44], 'e-Card': [190, 30], 'Promos Nintendo': [48, 8] };
export function hueStyle(series) {
  const k = (series || '').replace(/\s*\(JP\)$/, '');
  let h = HUES[k];
  if (!h) { let x = 7; for (const ch of k) x = (x * 31 + ch.charCodeAt(0)) % 360; h = [x, (x + 70) % 360]; }
  return `--h1:${h[0]};--h2:${h[1]}`;
}
const year = s => (s?.release_date || '').slice(0, 4);
const seriesName = s => (s || 'Autres').replace(/\s*\(JP\)$/, '');

export async function loadCollections() {
  if (!S.collections) {
    try { S.collections = await S.api.collections(); }
    catch (e) { S.collections = (await loadSets()).map(s => ({ ...s, cards: s.total })); } // vue set_overview pas encore créée : liste simple
  }
  return S.collections;
}

/** Bulle « ? » qui explique les estimations (sans JavaScript : <details>) */
export function helpPop(label = 'Comment sont estimées les chances de tirage ?') {
  return `<details class="pop"><summary aria-label="${esc(label)}" title="${esc(label)}">?</summary><div class="pop-body" role="note"><b>Chances de tirage : des estimations</b>${DROP_HELP.map(p => `<p>${esc(p)}</p>`).join('')}</div></details>`;
}
document.addEventListener('click', e => { for (const d of document.querySelectorAll('details.pop[open]')) if (!d.contains(e.target)) d.open = false; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('details.pop[open]').forEach(d => { d.open = false; }); });

/** Tuile d'une extension (page Collections et accueil) */
export function collectionTile(s, big = false) {
  const n = s.cards ?? s.total;
  return `<a class="col-tile${big ? ' big' : ''}" href="#/collections/${encodeURIComponent(s.id)}" style="${hueStyle(s.series)}">
    <div class="col-art">
      ${s.top_image ? `<span class="col-bgw" aria-hidden="true">${spriteBg(s.top_image) ? `<span class="col-bg" style="display:block;${spriteBg(s.top_image)}"></span>` : `<img class="col-bg" src="${esc(s.top_image)}" alt="" loading="lazy" decoding="async">`}</span>` : ''}
      <div class="col-logo">${s.logo ? `<img src="${esc(s.logo)}" alt="" loading="lazy" decoding="async">` : ''}<div class="ph"${s.logo ? ' hidden' : ''}>${esc(s.name)}</div></div>
      ${s.top_name ? `<div class="col-card" aria-hidden="true">${frame({ name: s.top_name, image_small: s.top_image })}</div>` : ''}
      <span class="col-year">${esc(year(s) || '—')}</span>
    </div>
    <div class="col-body">
      <div class="col-title">${esc(s.name)}${langTag(s.lang)}</div>
      <div class="meta">${esc(seriesName(s.series))}${n ? ` · ${num(n)} cartes` : ''}</div>
      ${s.top_name ? `<div class="col-star"><span class="meta">Carte phare</span><span class="nm">${esc(s.top_name)}</span><span class="v">${eur(s.top_price)}</span></div>` : ''}
    </div></a>`;
}

export async function renderCollections(el, params) {
  if (params?.get('q') != null) COL.q = params.get('q');
  el.innerHTML = `<section class="col-hero">
      <div class="eyebrow">${ICONS.grid.replace('<svg', '<svg width="16" height="16"')} Collections Pokémon</div>
      <h1>Choisissez une collection,<br><span class="hl">découvrez ses trésors.</span></h1>
      <p class="lead">Pour chaque extension : ses cartes de la plus rare à la plus commune, leur chance d'apparition en booster et leur cote du jour. Gratuit, sans compte.</p>
      <div class="stamp" id="col-stamp"></div>
      <p>${langNote()}</p>
    </section>
    <section class="col-feat" id="col-feat" aria-labelledby="col-feat-t" hidden></section>
    <section class="panel">
      <form class="form" id="col-form" role="search" onsubmit="return false">
        <label for="col-q" style="flex:1 1 220px">Rechercher une collection<input id="col-q" type="search" placeholder="151, Prismatic Evolutions, Célébrations…" value="${esc(COL.q)}" autocomplete="off"></label>
        <label for="col-series">Série<select id="col-series" class="w-m"><option value="">Toutes</option></select></label>
        <label for="col-sort">Trier par<select id="col-sort">${[['date', 'Plus récentes'], ['old', 'Plus anciennes'], ['top', 'Carte phare la plus chère'], ['value', 'Valeur totale'], ['name', 'Nom']].map(([k, v]) => `<option value="${k}"${COL.sort === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      </form>
    </section>
    <div id="col-body" class="col-sections"><div class="sub">Chargement des collections…</div></div>`;
  let list = [];
  try { list = (await loadCollections()).filter(s => (s.lang || 'EN') === S.cardLang); } catch (e) { const b = $('#col-body'); if (b) b.innerHTML = `<div class="empty">Chargement impossible : ${esc(errText(e))}</div>`; return; }
  if (!$('#col-body')) return;
  const total = list.reduce((a, s) => a + (+(s.cards ?? s.total) || 0), 0);
  $('#col-stamp').textContent = `${num(list.length)} collections · ${num(total)} cartes · cotes et chances de tirage estimées`;
  const series = [...new Set(list.map(s => seriesName(s.series)))].sort((a, b) => a.localeCompare(b, 'fr'));
  $('#col-series').innerHTML += series.map(s => `<option${COL.series === s ? ' selected' : ''}>${esc(s)}</option>`).join('');

  const feat = (setting('featured_sets', []) || []).map(id => list.find(s => s.id === id)).filter(Boolean).slice(0, 4);
  const draw = () => {
    Object.assign(COL, { q: $('#col-q').value.trim(), series: $('#col-series').value, sort: $('#col-sort').value });
    const words = norm(COL.q).split(/\s+/).filter(Boolean);
    const res = list.filter(s => (!COL.series || seriesName(s.series) === COL.series)
      && words.every(w => norm(`${s.name} ${s.id} ${s.series} ${year(s)}`).includes(w)));
    const fb = $('#col-feat'), noFilter = !words.length && !COL.series;
    fb.hidden = !(noFilter && feat.length);
    fb.innerHTML = feat.length ? `<div class="col-group-head"><h2 id="col-feat-t">À la une</h2><span class="sub">Les collections que les collectionneurs regardent en ce moment</span></div><div class="col-grid feat">${feat.map(s => collectionTile(s, true)).join('')}</div>` : '';
    const body = $('#col-body');
    if (!res.length) { body.innerHTML = '<div class="empty">Aucune collection ne correspond. Essayez le nom anglais (ex. « Celebrations ») ou retirez un filtre.</div>'; return; }
    const by = { date: (a, b) => (b.release_date || '').localeCompare(a.release_date || ''), old: (a, b) => (a.release_date || '9').localeCompare(b.release_date || '9'),
      top: (a, b) => (b.top_price ?? -1) - (a.top_price ?? -1), value: (a, b) => (b.value ?? -1) - (a.value ?? -1), name: (a, b) => a.name.localeCompare(b.name, 'fr') }[COL.sort] || (() => 0);
    res.sort((a, b) => by(a, b) || a.id.localeCompare(b.id));
    if (COL.sort === 'date' || COL.sort === 'old') {
      // Regroupées par série (époque), dans l'ordre de la plus récente extension de chaque série
      const groups = new Map();
      for (const s of res) { const k = seriesName(s.series); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
      body.innerHTML = [...groups].map(([k, g]) => `<section class="col-group" style="${hueStyle(k)}" aria-label="${esc(k)}">
        <div class="col-group-head"><h2>${esc(k)}</h2><span class="sub">${g.length} collection${g.length > 1 ? 's' : ''}${year(g[g.length - 1]) && year(g[0]) !== year(g[g.length - 1]) ? ` · ${COL.sort === 'old' ? year(g[0]) + '–' + year(g[g.length - 1]) : year(g[g.length - 1]) + '–' + year(g[0])}` : year(g[0]) ? ' · ' + year(g[0]) : ''}</span></div>
        <div class="col-grid">${g.map(s => collectionTile(s)).join('')}</div></section>`).join('');
    } else body.innerHTML = `<div class="col-grid">${res.map(s => collectionTile(s)).join('')}</div>`;
  };
  $('#col-form').addEventListener('input', debounce(draw, 200));
  draw();
}

/* ---------- page d'une collection ---------- */
const tile = (c, t) => `<button class="ct lv${t.level}" type="button" data-card="${esc(c.id)}" aria-label="${esc(`${c.name}, n° ${c.number || '—'}, ${t.label}, ${fmtCard(t)}, cote ${eur(c.price)}`)}">
    <span class="ct-art">${frame(c)}<span class="rbadge lv${t.level}">${esc(t.short)}</span></span>
    <span class="ct-name" title="${esc(c.name)}">${esc(c.name)}</span>
    <span class="ct-row"><span class="meta">n° ${esc(c.number || '—')}</span><span class="ct-price">${eur(c.price)}</span></span>
    <span class="ct-drop" title="Chance estimée de tirer cette carte précise dans un booster">${PACK_ICON}${esc(fmtCard(t, true))}</span></button>`;
const listTable = (rows, dt) => `<div class="tbl short"><table><thead><tr><th>Carte</th><th>Rareté</th><th class="n">Chance estimée</th><th class="n">Cote</th></tr></thead><tbody>${rows.map(c => { const t = dt.byId.get(c.id);
  return `<tr class="go" tabindex="0" data-card="${esc(c.id)}"><td><div class="cell-card">${thumb(c)}<div><div class="nm">${esc(c.name)}</div><div class="meta">n° ${esc(c.number || '—')}</div></div></div></td>
    <td><span class="rbadge inline lv${t.level}">${esc(t.short)}</span></td><td class="n">${esc(fmtCard(t, true))}</td><td class="n">${eur(c.price)}</td></tr>`; }).join('')}</tbody></table></div>`;
const byPrice = (a, b) => (b.price ?? -1) - (a.price ?? -1) || (a.number || '').localeCompare(b.number || '', 'fr', { numeric: true });

export async function renderCollection(el, id) {
  el.innerHTML = '<div class="sub">Chargement de la collection…</div>';
  SETV.q = '';
  const [list, sets] = await Promise.all([loadCollections().catch(() => []), loadSets()]);
  const s = { ...(sets.find(x => x.id === id) || {}), ...(list.find(x => x.id === id) || {}) };
  if (!s.id) { el.innerHTML = '<div class="empty">Collection introuvable. <a href="#/collections">Voir toutes les collections</a></div>'; return; }
  document.title = `${s.name} · Collections · Pokédex Trader`;
  let cards;
  try { cards = await loadSetCards(id); } catch (e) { el.innerHTML = `<div class="empty">Chargement impossible : ${esc(errText(e))}</div>`; return; }
  const dt = dropTable(s, cards), pf = dt.profile;
  const priced = cards.filter(c => c.price != null).sort(byPrice);
  // Fiche seule (série sans liste de cartes en démo) : chiffres de la vue d'ensemble
  const value = cards.length ? (priced.length ? priced.reduce((a, c) => a + +c.price, 0) : null) : (s.value ?? null);
  const top = priced[0] || (s.top_name ? { name: s.top_name, price: s.top_price } : null);
  const packTxt = pf.none ? `<b>Hors booster</b> : ${esc(pf.none)}. Les cartes sont classées par rareté, sans chance de tirage.`
    : `Vendue en ${esc(pf.pack)} · chances de tirage estimées${pf.provisional ? ' (provisoires, extension récente)' : ''}`;

  el.innerHTML = `<a class="back" href="#/collections">← Toutes les collections</a>
    <section class="set-hero" style="${hueStyle(s.series)}">
      <div class="sh-info">
        ${s.logo ? `<div class="sh-logo"><img src="${esc(s.logo)}" alt="" decoding="async"><div class="ph" hidden></div></div>` : ''}
        <div class="sh-eyebrow">${esc(seriesName(s.series))}${year(s) ? ' · ' + esc(year(s)) : ''} · ${esc(LANGS[s.lang] || s.lang || '')}</div>
        <h1>${esc(s.name)}</h1>
        <div class="sh-stats">
          <div><span class="l">Cartes</span><span class="v">${num(cards.length || s.cards || 0)}</span></div>
          <div title="Somme des cotes de toutes les cartes cotées, un exemplaire de chaque"><span class="l">Valeur du set</span><span class="v">${value == null ? '—' : eur(value)}</span>${value == null ? '<span class="d">cote pas encore disponible</span>' : ''}</div>
          ${top ? `<div class="wide"><span class="l">Carte phare</span><span class="v">${esc(top.name)} · ${eur(top.price)}</span></div>` : ''}
        </div>
        <p class="sh-pack">${PACK_ICON}${packTxt} ${helpPop()}</p>
      </div>
      ${priced.length ? `<div class="sh-fan" aria-hidden="true">${priced.slice(0, 3).map(c => `<button class="fan-c" type="button" tabindex="-1" data-card="${esc(c.id)}">${frame(c)}</button>`).join('')}</div>` : ''}
    </section>
    <section class="panel set-tools">
      <div class="form">
        <div class="field"><span class="flabel" id="sv-sort-l">Trier</span><div class="seg" role="group" aria-labelledby="sv-sort-l"><button type="button" data-sort="rarity">Par rareté</button><button type="button" data-sort="price">Par prix</button></div></div>
        <div class="field"><span class="flabel" id="sv-view-l">Affichage</span><div class="seg" role="group" aria-labelledby="sv-view-l"><button type="button" data-view="grid">${ICONS.grid}Grille</button><button type="button" data-view="list">${ICONS.menu}Liste</button></div></div>
        <label for="sv-q" style="flex:1 1 180px">Filtrer<input id="sv-q" type="search" placeholder="Nom ou numéro" value="${esc(SETV.q)}" autocomplete="off"></label>
      </div>
      <p class="sub">Touchez une carte pour voir le détail de son prix. Les chances de tirage sont des estimations ${helpPop()}</p>
    </section>
    <div id="sv-body" class="tiers"></div><div id="sv-prod"></div>`;
  // Produits scellés de la série (displays, coffrets dresseur d'élite, boosters…), sous les cartes
  S.api.products?.({ set_id: id, limit: 60 }).then(rows => {
    const box = $('#sv-prod'); if (!box || !rows?.length) return;
    box.innerHTML = `<section class="panel tier"><div class="tier-head"><h2>Produits scellés <span class="tier-odds">— displays, coffrets, boosters</span></h2>
      <span class="sub">${rows.length} produit${rows.length > 1 ? 's' : ''} · <a href="#/produits">tous les produits</a></span></div>${productGrid(rows)}</section>`;
  }).catch(() => {});

  const draw = () => {
    el.querySelectorAll('[data-sort]').forEach(b => b.setAttribute('aria-pressed', b.dataset.sort === SETV.sort));
    el.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === SETV.view));
    const words = norm(SETV.q).split(/\s+/).filter(Boolean);
    const keep = c => words.every(w => norm(`${c.name} ${c.number}`).includes(w));
    const body = $('#sv-body');
    if (!cards.length) { body.innerHTML = `<div class="empty">${S.api.mode === 'demo' && s.overview_only ? 'Aperçu de démonstration : la fiche de cette série est là, la liste de ses cartes s\'affichera sur le site en ligne.' : 'Aucune carte connue pour cette collection.'}</div>`; return; }
    const block = rows => SETV.view === 'list' ? listTable(rows, dt) : `<div class="ct-grid">${rows.map(c => tile(c, dt.byId.get(c.id))).join('')}</div>`;
    if (SETV.sort === 'price') {
      const rows = cards.filter(keep).sort(byPrice);
      body.innerHTML = rows.length ? `<section class="panel tier"><div class="tier-head"><h2>Toutes les cartes <span class="tier-odds">— de la plus chère à la moins chère</span></h2><span class="sub">${rows.length} carte${rows.length > 1 ? 's' : ''}</span></div>${block(rows)}</section>`
        : '<div class="empty">Aucune carte ne correspond à ce filtre.</div>';
      return;
    }
    const html = dt.tiers.map(t => {
      const rows = t.cards.filter(keep).sort(byPrice);
      if (!rows.length) return '';
      const odds = t.kind === 'pack' ? ` <span class="tier-odds">— ${esc(fmtTier(t.odds))}</span>` : t.kind === 'none' ? ' <span class="tier-odds">— hors booster</span>' : '';
      const each = t.kind === 'pack' ? ` · une carte précise : ${esc(fmtCard(t))}` : t.kind === 'unknown' ? ' · rareté absente des données, pas d\'estimation' : '';
      return `<section class="panel tier"><div class="tier-head"><span class="rdot lv${t.level}" aria-hidden="true"></span><h2>${esc(t.plural)}${odds}</h2>
        <span class="sub">${t.n} carte${t.n > 1 ? 's' : ''}${each}</span></div>${block(rows)}</section>`;
    }).join('');
    body.innerHTML = html || '<div class="empty">Aucune carte ne correspond à ce filtre.</div>';
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-sort],[data-view]');
    if (!b) return;
    if (b.dataset.sort) SETV.sort = b.dataset.sort;
    if (b.dataset.view) { SETV.view = b.dataset.view; store.set('pt-col-view', SETV.view); }
    draw();
  });
  $('#sv-q').addEventListener('input', debounce(e => { SETV.q = e.target.value.trim(); draw(); }, 200));
  draw();
}
