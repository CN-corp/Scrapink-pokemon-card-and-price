// Produits scellés (public) : displays, coffrets Dresseur d'élite, boosters, tins… avec leur cote et leur variation
// sur 7, 30 et 90 jours. Pro en plus : signaux d'achat et de vente du scellé (même grille que les cartes).
// Un clic sur un produit ouvre sa fiche (views/card.js), comme une carte.
import { $, esc, eur, pc, num, debounce } from '../util.js';
import { S, hasPro } from '../state.js';
import { frame, kpis, pill, proHint, proTag } from '../ui.js';

export const PTYPES = { display: 'Display', etb: 'Coffret Dresseur d\'élite', bundle: 'Bundle de boosters', booster: 'Booster', blister: 'Blister',
  tin: 'Pokébox (tin)', coffret: 'Coffret', deck: 'Deck et kit', case: 'Carton (case)' };
const ORDER = ['display', 'etb', 'bundle', 'booster', 'blister', 'coffret', 'tin', 'deck', 'case'];
const PV = { type: '', q: '', sort: 'price', shown: 60 };

/** Vignettes de produits (aussi utilisées en bas de la page d'une collection) */
export function productGrid(rows) {
  return `<div class="ct-grid prod-grid">${rows.map(p => `<button class="ct prod" type="button" data-card="${esc(p.id)}" aria-label="${esc(`${p.name}, ${PTYPES[p.ptype] || 'produit'}, cote ${eur(p.price)}`)}">
    <span class="ct-art">${frame(p)}<span class="rbadge pt-badge">${esc(PTYPES[p.ptype] || 'Produit')}</span></span>
    <span class="ct-name prod-name">${esc(p.name)}</span><span class="meta">${esc(p.set_name || '')}</span>
    <span class="ct-row"><span class="ct-price">${eur(p.price)}</span>${p.chg30 == null ? '' : `<span class="ct-drop" title="Variation sur 30 jours">${pc(p.chg30)} <span class="meta">30 j</span></span>`}</span></button>`).join('')}</div>`;
}

export async function renderProducts(el, params) {
  if (params.get('type') && PTYPES[params.get('type')]) PV.type = params.get('type');
  document.title = 'Produits scellés · Pokédex Trader';
  el.innerHTML = '<div class="sub">Chargement des produits…</div>';
  let all;
  try { all = await S.api.products({ limit: 5000 }); } catch (e) { all = []; }
  if (!all.length) { el.innerHTML = '<div class="empty">Aucun produit scellé disponible pour le moment.</div>'; return; }
  const withChg = all.filter(p => p.chg30 != null);
  const up = withChg.reduce((b, p) => !b || p.chg30 > b.chg30 ? p : b, null), down = withChg.reduce((b, p) => !b || p.chg30 < b.chg30 ? p : b, null);
  const counts = Object.fromEntries(ORDER.map(k => [k, all.filter(p => p.ptype === k).length]));
  el.innerHTML = `<section class="col-hero prod-hero">
      <span class="eyebrow">Le scellé</span>
      <h1>Displays, coffrets, boosters :<br><span class="hl">la cote du scellé, au jour le jour.</span></h1>
      <p class="lead">${num(all.length)} produits scellés suivis, de Set de Base à Méga-Évolution, avec leur cote, leur variation et, en Pro, les signaux d'achat et de vente.</p>
      <p class="stamp">Cote TCGplayer du produit anglais, convertie en euros. Historique relevé chaque jour${S.api.mode === 'demo' ? ' ; en démo, la courbe est simulée et finit sur la cote réelle' : ''}.</p>
    </section>
    ${kpis([['Produits suivis', num(all.length)], ['Valeur cumulée', eur(all.reduce((a, p) => a + (p.price || 0), 0)), 'un exemplaire de chaque'],
      ['Plus forte hausse 30 j', up ? `${pc(up.chg30)}` : '—', up ? esc(up.name) : ''], ['Plus forte baisse 30 j', down ? `${pc(down.chg30)}` : '—', down ? esc(down.name) : '']])}
    <section class="panel"><div class="head"><div><h2>Signaux du jour sur le scellé ${hasPro() ? '' : proTag()}</h2><div class="sub">Les produits à acheter et ceux à vendre aujourd'hui, selon la tendance, la volatilité et le prix des offres.</div></div></div>
      <div id="pv-sig">${hasPro() ? '<div class="sub">Chargement…</div>' : proHint('Signaux d\'achat et de vente, prix d\'achat conseillé et objectif de revente sur chaque produit scellé.')}</div></section>
    <section class="panel set-tools">
      <div class="form">
        <div class="field" style="min-width:0;max-width:100%"><span class="flabel" id="pv-type-l">Type</span><div class="seg" role="group" aria-labelledby="pv-type-l">
          <button type="button" data-type="">Tous <span class="meta">${all.length}</span></button>${ORDER.filter(k => counts[k]).map(k => `<button type="button" data-type="${k}">${esc(PTYPES[k])} <span class="meta">${counts[k]}</span></button>`).join('')}</div></div>
        <label for="pv-sort">Trier<select id="pv-sort"><option value="price">Cote, la plus haute</option><option value="chg30">Plus fortes hausses 30 j</option><option value="drop30">Plus fortes baisses 30 j</option><option value="date">Plus récents</option><option value="name">Nom</option></select></label>
        <label for="pv-q" style="flex:1 1 200px">Rechercher<input id="pv-q" type="search" placeholder="Nom, série…" autocomplete="off" value="${esc(PV.q)}"></label>
      </div></section>
    <div id="pv-body"></div>`;
  $('#pv-sort').value = PV.sort;

  const draw = async () => {
    el.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', b.dataset.type === PV.type));
    const rows = await S.api.products({ type: PV.type, q: PV.q, sort: PV.sort, limit: 5000 });
    const body = $('#pv-body'); if (!body) return;
    body.innerHTML = rows.length ? `<section class="panel tier"><div class="tier-head"><h2>${esc(PV.type ? PTYPES[PV.type] : 'Tous les produits')}</h2><span class="sub">${num(rows.length)} produit${rows.length > 1 ? 's' : ''}</span></div>
      ${productGrid(rows.slice(0, PV.shown))}${rows.length > PV.shown ? `<div class="row" style="justify-content:center"><button class="btn" type="button" id="pv-more">Afficher plus (${num(rows.length - PV.shown)} restants)</button></div>` : ''}</section>`
      : '<div class="empty">Aucun produit ne correspond à ce filtre.</div>';
    $('#pv-more')?.addEventListener('click', () => { PV.shown += 60; draw(); });
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) { PV.type = b.dataset.type; PV.shown = 60; draw(); } });
  $('#pv-sort').addEventListener('change', e => { PV.sort = e.target.value; PV.shown = 60; draw(); });
  $('#pv-q').addEventListener('input', debounce(e => { PV.q = e.target.value.trim(); PV.shown = 60; draw(); }, 220));
  draw();

  if (hasPro()) {
    let rows = [];
    try { rows = (await S.api.market({ kind: 'buy', min: 0, limit: 100000 })).filter(r => r.kind === 'sealed'); } catch (e) { rows = []; }
    const box = $('#pv-sig'); if (!box) return;
    const buy = rows.filter(r => /^ACHAT/.test(r.signal)).sort((a, b) => b.buy_score - a.buy_score).slice(0, 6);
    const sell = [...rows].sort((a, b) => b.sell_score - a.sell_score).filter(r => r.sell_score >= 60).slice(0, 6);
    const list = (title, rs, key) => `<div><h3>${title}</h3>${rs.length ? `<div class="tbl short"><table><tbody>${rs.map(r => `<tr class="go" tabindex="0" data-card="${esc(r.card_id)}">
      <td><div class="nm">${esc(r.name)}</div><div class="meta">${esc(PTYPES[r.ptype] || '')} · ${esc(r.set_name || '')}</div></td><td>${pill(key === 'sell' && r.sell_score >= 70 ? 'VENDRE' : key === 'sell' ? 'ALLÉGER' : r.signal)}</td>
      <td class="n">${eur(r.price)}<br>${pc(r.mom30)} <span class="meta">30 j</span></td><td class="why">${(key === 'buy' ? r.reasons_buy : r.reasons_sell).slice(0, 2).map(esc).join(' · ')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucun produit aujourd\'hui.</div>'}</div>`;
    box.innerHTML = `<div class="grid-2">${list('À acheter', buy, 'buy')}${list('À vendre', sell, 'sell')}</div><p class="meta">Indicateurs statistiques calculés chaque matin, pas un conseil financier.</p>`;
  }
}
