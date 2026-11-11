// Marché (opportunités + mouvements de la semaine) et Classement achat / vente : réservés Pro.
import { $, esc, eur, pc, fdate, num } from '../util.js';
import { S, hasPro, cacheCards } from '../state.js';
import { marketTable, filterBar, readFilters, bindFilters, locked, pill, scoreBar, confBar, cardCell, frame, langTag, langNote, SIGNALS, lockChip } from '../ui.js';

const MK = { movers: 'hot', rankMode: 'buy', rankShow: 150 };

/** Aperçu en vignettes : l'illustration et la cote ; le signal du jour seulement pour Pro (la base ne le renvoie qu'à Pro) */
export function teaserTiles(rows) {
  return `<div class="opp-grid">${rows.map((r, i) => `<button class="opp" type="button" data-card="${esc(r.card_id)}" style="--i:${i}">
    <span class="opp-rk">${i + 1}</span>${frame(r)}<span class="opp-nm">${esc(r.name)}${langTag(r.lang)}</span><span class="meta">${esc(r.set_name || '')}</span>
    <span class="opp-row"><b>${eur(r.price)}</b>${r.signal ? pill(r.signal) : lockChip()}</span></button>`).join('')}</div>`;
}
function teaserLocked(rows) {
  return `${rows.length ? teaserTiles(rows) : ''}
    ${locked({ title: 'Toutes les opportunités, chaque matin', text: 'Les raisons de chaque signal, les estimations à 30 jours nettes de frais et les plus fortes hausses et baisses de la semaine.' })}`;
}

export async function renderMarket(el, params) {
  el.innerHTML = `<div class="page-title"><div><h1>Marché</h1><p class="sub">Analyse du jour${S.status?.last_price_date ? ', cotes du ' + fdate(S.status.last_price_date) : ''}. Gain estimé net de frais de revente (5 % + 1,20 €).</p><p>${langNote()}</p></div></div><div id="mk-body" class="view"></div>`;
  const body = $('#mk-body');
  if (!hasPro()) {
    let t = []; try { t = await S.api.teaser(S.cardLang); } catch (e) { /* aperçu indisponible */ }
    body.innerHTML = `<section class="panel"><div class="head"><div><h2>Les opportunités du jour</h2><div class="sub">${t.length ? `Les ${t.length} cartes les mieux placées ce matin. Touchez une carte pour sa fiche.` : 'Pas encore d\'opportunité dans cette langue : il faut d\'abord des cotes relevées sur son propre marché.'}</div></div></div>${teaserLocked(t)}</section>`;
    return;
  }
  body.innerHTML = `<section class="panel"><div class="head"><div><h2>Opportunités d'achat</h2><div class="sub">Classées par score d'achat, cartes à partir de 50 € par défaut.</div></div></div>
      ${filterBar('m', { min: 50 })}<div id="m-body"><div class="sub">Chargement…</div></div></section>
    <section class="panel"><div class="head"><div><h2>Mouvements de la semaine</h2><div class="sub">Variation sur 7 jours, cartes à partir de 10 €.</div></div>
      <div class="seg" role="tablist" aria-label="Sens des mouvements"><button type="button" role="tab" id="mv-hot" aria-selected="${MK.movers === 'hot'}">Plus fortes hausses</button><button type="button" role="tab" id="mv-cold" aria-selected="${MK.movers === 'cold'}">Plus fortes baisses</button></div></div>
      ${filterBar('v')}<div id="v-body"><div class="sub">Chargement…</div></div></section>`;
  let s1 = 0, s2 = 0;
  const loadBuy = async () => {
    const my = ++s1, f = readFilters('m');
    try { const rows = cacheCards(await S.api.market({ kind: 'buy', ...f, min: f.min ?? 0 })); if (my === s1 && $('#m-body')) $('#m-body').innerHTML = marketTable(rows, 'buy'); }
    catch (e) { if ($('#m-body')) $('#m-body').innerHTML = `<div class="empty">Chargement impossible : ${esc(e.message)}</div>`; }
  };
  const loadMovers = async () => {
    const my = ++s2, f = readFilters('v');
    try { const rows = cacheCards(await S.api.market({ kind: MK.movers, ...f })); if (my === s2 && $('#v-body')) $('#v-body').innerHTML = marketTable(rows, 'all'); }
    catch (e) { if ($('#v-body')) $('#v-body').innerHTML = `<div class="empty">Chargement impossible : ${esc(e.message)}</div>`; }
  };
  const setMovers = m => { MK.movers = m; $('#mv-hot').setAttribute('aria-selected', m === 'hot'); $('#mv-cold').setAttribute('aria-selected', m === 'cold'); loadMovers(); };
  $('#mv-hot').addEventListener('click', () => setMovers('hot'));
  $('#mv-cold').addEventListener('click', () => setMovers('cold'));
  bindFilters('m', loadBuy); bindFilters('v', loadMovers);
  const q0 = params?.get('q'); // arrivée depuis une fiche carte : opportunités filtrées sur cette carte
  if (q0) { $('#m-q').value = q0; $('#m-min').value = ''; }
  loadBuy(); loadMovers();
}

export async function renderRank(el) {
  el.innerHTML = `<div class="page-title"><div><h1>Classement</h1><p class="sub" id="rk-note"></p><p>${langNote()}</p></div>
    <div class="seg" role="tablist" aria-label="Sens du classement"><button type="button" role="tab" id="rk-buy" aria-selected="${MK.rankMode === 'buy'}">À acheter</button><button type="button" role="tab" id="rk-sell" aria-selected="${MK.rankMode === 'sell'}">À vendre</button></div></div>
    <section class="panel" id="rk-panel"></section>`;
  const panel = $('#rk-panel');
  if (!hasPro()) { panel.innerHTML = locked({ title: 'Le classement achat et vente', text: 'Toutes les cartes à partir de 50 €, classées par note globale (score pondéré par la confiance dans l\'analyse), à l\'achat comme à la vente.' }); $('#rk-buy').disabled = $('#rk-sell').disabled = true; return; }
  panel.innerHTML = `<div class="form" id="fb-rk">
      <label for="rk-min">Cote mini (€)<input id="rk-min" class="w-s" type="number" min="0" value="50"></label>
      <label for="rk-max">Cote maxi (€)<input id="rk-max" class="w-s" type="number" min="0" placeholder="aucune"></label>
      <label for="rk-score">Note mini<input id="rk-score" class="w-xs" type="number" min="0" max="100" placeholder="0"></label>
      <label for="rk-signal">Signal<select id="rk-signal"><option value="">Tous</option>${SIGNALS.map(s => `<option>${s}</option>`).join('')}</select></label>
      <label for="rk-conf">Confiance mini<select id="rk-conf"><option value="0">Toutes</option><option value="40">40 et plus</option><option value="55">55 et plus</option><option value="70">70 et plus</option></select></label>
      <label for="rk-sort">Trier par<select id="rk-sort"><option value="rank">Note globale</option><option value="score">Score seul</option><option value="conf">Confiance</option><option value="gain">Gain estimé 30 j</option><option value="year">Tendance de fond</option><option value="price">Prix</option></select></label>
      <label for="rk-q">Texte<input id="rk-q" class="w-m" type="search" placeholder="Nom, extension…"></label></div>
    <div id="rk-body"><div class="sub">Chargement…</div></div>`;
  let seq = 0;
  const load = async (append = false) => {
    const sell = MK.rankMode === 'sell', my = ++seq, v = id => $('#rk-' + id).value.trim();
    $('#rk-note').textContent = `${sell ? 'Les cartes qui méritent le plus d\'être vendues' : 'Les cartes qui méritent le plus d\'être achetées'}. Note globale = score ${sell ? 'de vente' : 'd\'achat'} pondéré par la confiance dans l'analyse.`;
    const f = { mode: MK.rankMode, lang: S.cardLang, min: v('min') === '' ? 0 : +v('min'), max: v('max') === '' ? null : +v('max'), score: v('score') === '' ? null : +v('score'),
      signal: v('signal'), conf: +v('conf') || 0, sort: v('sort'), q: v('q'), limit: MK.rankShow, offset: 0 };
    let res;
    try { res = await S.api.rank(f); } catch (e) { $('#rk-body').innerHTML = `<div class="empty">Chargement impossible : ${esc(e.message)}</div>`; return; }
    if (my !== seq || !$('#rk-body')) return;
    cacheCards(res.rows);
    if (!res.rows.length) { $('#rk-body').innerHTML = '<div class="empty">Aucune carte ne correspond à ces critères.</div>'; return; }
    $('#rk-body').innerHTML = `<div class="sub">${num(res.total)} cartes classées</div><div class="tbl"><table><thead><tr><th class="rk">#</th><th>Carte</th><th>Signal</th><th class="n">Note globale</th><th class="n">Confiance</th><th class="n">Cote</th><th class="n">Gain net 30 j</th><th class="n">Tendance</th><th>Pourquoi</th></tr></thead><tbody>` +
      res.rows.map((r, i) => `<tr class="go" tabindex="0" data-card="${esc(r.card_id)}"><td class="rk">${i + 1}</td><td>${cardCell(r)}</td><td>${pill(r.signal)}</td>
        <td class="n">${scoreBar(sell ? r.rank_sell : r.rank_buy)}</td><td class="n">${confBar(r.confidence)}</td><td class="n">${eur(r.price)}</td><td class="n">${pc(r.exp_return30_net)}</td>
        <td class="n" title="${r.trend_year != null ? 'sur 1 an' : r.mom365 != null ? 'sur 365 j' : 'sur 90 j'}">${pc(r.trend_year ?? r.mom365 ?? r.mom90)}</td>
        <td class="why">${(sell ? [...(r.reasons_sell || []), ...(r.reasons_buy || [])] : r.reasons_buy || []).slice(0, 2).map(esc).join(' · ')}</td></tr>`).join('') + '</tbody></table></div>' +
      (res.total > res.rows.length ? `<div><button class="btn" type="button" id="rk-more">Afficher les ${Math.min(150, res.total - res.rows.length)} suivantes</button></div>` : '');
    $('#rk-more')?.addEventListener('click', () => { MK.rankShow += 150; load(true); });
  };
  const reset = () => { MK.rankShow = 150; load(); };
  bindFilters('rk', reset);
  const mode = m => { MK.rankMode = m; $('#rk-buy').setAttribute('aria-selected', m === 'buy'); $('#rk-sell').setAttribute('aria-selected', m === 'sell'); reset(); };
  $('#rk-buy').addEventListener('click', () => mode('buy'));
  $('#rk-sell').addEventListener('click', () => mode('sell'));
  load();
}
