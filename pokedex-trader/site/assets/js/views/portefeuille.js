// Portefeuille (compte gratuit) : saisie des achats et des ventes (cartes et produits scellés), capital investi,
// valeur à la cote et plus ou moins-value totale du portefeuille (latente + réalisée, méthode FIFO).
// Pro en plus : détail ligne par ligne (prix de revient, plus-value, poids, conseil), ventes réalisées, courbe de performance.
import { $, esc, eur, pc, sg, fdate, today, toast, errText, cssVar } from '../util.js';
import { S, hasPro, cacheCards } from '../state.js';
import { kpis, pill, cardCell, cardPicker, needLogin, proHint, chart, chartBase, isSealed } from '../ui.js';
import { loadPortfolio } from '../portfolio.js';
import { tradeZones } from '../advice.js';
import { espaceNav } from './subnav.js';
import { PTYPES } from './produits.js';
import { celebrateBuy, celebrateSell } from '../celebrate.js';
import { celebrationTier } from '../pullrates.js';

const CONDS = ['NM', 'EX', 'GD', 'LP', 'PSA 10', 'PSA 9', 'PSA 8', 'PCA 10', 'PCA 9.5', 'PCA 9', 'CCC 10', 'CCC 9', 'CGC 10', 'CGC 9.5'];
const SEALED_CONDS = ['Scellé', 'Ouvert'];

export async function renderPortfolio(el, params) {
  if (!S.user) { el.innerHTML = needLogin('votre portefeuille'); return; }
  const pro = hasPro();
  el.innerHTML = `${espaceNav('portefeuille')}
    <div class="page-title"><div><h1>Mon portefeuille</h1><p class="sub">Notez chaque achat et chaque vente : la plus ou moins-value se calcule toute seule, à la cote du jour.</p></div></div>
    <div id="pf-kpis"><div class="sub">Chargement…</div></div>
    <section class="panel pf-entry"><div class="head"><div><h2>Noter un achat ou une vente</h2><div class="sub">Une carte ou un produit scellé (display, coffret, booster…), le prix payé ou encaissé, les frais.</div></div></div>
      <form class="form" id="tx-form">
        <div class="field"><span class="flabel" id="tx-side-l">Opération</span><div class="seg side-seg" role="group" aria-labelledby="tx-side-l"><button type="button" data-side="buy" aria-pressed="true">Achat</button><button type="button" data-side="sell" aria-pressed="false">Vente</button></div></div>
        <div class="search" style="flex:1 1 260px"><label for="tx-q">Carte ou produit<input id="tx-q" placeholder="Tapez un nom de carte ou de produit" autocomplete="off" class="w-full"></label><div class="sugg" hidden></div></div>
        <label for="tx-qty">Quantité<input id="tx-qty" class="w-xs" type="number" value="1" min="1" inputmode="numeric"></label>
        <label for="tx-price">Prix unitaire (€)<input id="tx-price" class="w-s" type="number" step="0.01" min="0" inputmode="decimal" required></label>
        <label for="tx-fees">Frais (€)<input id="tx-fees" class="w-xs" type="number" step="0.01" min="0" value="0" inputmode="decimal"></label>
        <label for="tx-date">Date<input id="tx-date" type="date" value="${today()}" max="${today()}"></label>
        <label for="tx-cond">État<select id="tx-cond">${CONDS.map(c => `<option>${c}</option>`).join('')}</select></label>
        <label for="tx-plat">Plateforme<input id="tx-plat" class="w-m" maxlength="60" placeholder="Cardmarket, Vinted…"></label>
        <button class="btn primary" type="submit" id="tx-save">Enregistrer l'achat</button>
      </form><div class="msg" id="tx-msg" role="status"></div><div class="sub" id="tx-preview"></div>
      ${S.api.mode === 'demo' ? `<div class="cel-try"><span class="sub">Voir les animations :</span>${['Commune', 'Rare', 'Ultra rare', 'Secrète'].map((l, i) => `<button class="btn small" type="button" data-try="${i + 1}">${l}</button>`).join('')}<button class="btn small" type="button" data-try="sell">Vente</button></div>` : ''}</section>
    <section class="panel"><div class="head"><div><h2>Performance du portefeuille</h2><div class="sub" id="pf-perf-note"></div></div></div>
      ${pro ? '<div class="chart"><canvas id="pf-perf" aria-label="Valeur du portefeuille et capital investi dans le temps"></canvas></div>' : proHint('Courbe de la valeur de votre portefeuille face au capital investi, jour après jour.')}<div class="sub" id="pf-perf-empty"></div></section>
    <section class="panel"><div class="head"><div><h2>Mes positions</h2><div class="sub">${pro ? 'Prix de revient FIFO, plus-value latente et conseil du jour, ligne par ligne.' : 'Quantité et valeur à la cote du jour.'}</div></div></div><div id="pf-pos"></div></section>
    <section class="panel"><h2>Ventes réalisées</h2><div id="pf-real"></div></section>
    <section class="panel"><h2>Historique des achats et ventes</h2><div id="tx-body"></div></section>`;

  let side = 'buy', pick = null, pf;
  const fillFrom = c => {
    pick = c;
    $('#tx-cond').innerHTML = (isSealed(c) ? SEALED_CONDS : CONDS).map(x => `<option>${x}</option>`).join('');
    if (c.price != null && !$('#tx-price').value) $('#tx-price').value = c.price;
    preview();
  };
  const picker = cardPicker($('#tx-q'), $('#tx-form .sugg'), fillFrom, { filters: { kind: 'all' } });
  if (params.get('side') === 'sell') queueMicrotask(() => el.querySelector('[data-side="sell"]')?.click());
  const pre = params.get('card');
  if (pre) { try { const c = S.cards.get(pre) || await S.api.card(pre); if (c) { cacheCards([c]); picker.set(c); fillFrom(c); } } catch (e) { /* inconnue */ } }

  const held = (cid, date) => pf ? pf.txs.filter(t => t.card_id === cid && t.date <= date).reduce((a, t) => a + (t.side === 'buy' ? t.quantity : -t.quantity), 0) : 0;
  // Aperçu avant enregistrement : coût total de l'achat, ou plus ou moins-value de la vente (FIFO approchée par le prix de revient moyen)
  function preview() {
    const box = $('#tx-preview'); if (!box) return;
    const q = parseInt($('#tx-qty').value, 10) || 0, p = parseFloat($('#tx-price').value), f = parseFloat($('#tx-fees').value || '0') || 0;
    if (!pick || !(q > 0) || !(p >= 0)) { box.textContent = ''; return; }
    if (side === 'buy') { box.innerHTML = `Coût total : <b>${eur(q * p + f)}</b>${pick.price != null ? ` · cote du jour ${eur(pick.price)} (${pc(p / pick.price - 1)} par rapport à la cote)` : ''}`; return; }
    const pos = pf?.sum.pos.find(x => x.cid === pick.id), h = held(pick.id, $('#tx-date').value || today());
    if (!pos || !h) { box.innerHTML = '<span class="down">Vous ne détenez pas cette carte : notez d\'abord son achat.</span>'; return; }
    const res = q * p - f - Math.min(q, h) * pos.avg;
    box.innerHTML = `Vous détenez ${h} ex. au prix de revient moyen de ${eur(pos.avg)} · encaissé net ${eur(q * p - f)} · ${res >= 0 ? 'plus-value' : 'moins-value'} estimée <b>${sg(res)}</b>`;
  }
  ['#tx-qty', '#tx-price', '#tx-fees', '#tx-date'].forEach(s => $(s).addEventListener('input', preview));
  el.querySelector('.side-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-side]'); if (!b) return;
    side = b.dataset.side;
    el.querySelectorAll('[data-side]').forEach(x => x.setAttribute('aria-pressed', x === b));
    $('#tx-save').textContent = side === 'buy' ? 'Enregistrer l\'achat' : 'Enregistrer la vente';
    $('#tx-save').classList.toggle('danger-fill', side === 'sell');
    preview();
  });

  // Total encaissé par les ventes et résultat réalisé (avant et après une vente, pour l'animation)
  const sold = () => (pf?.sum.realized || []).reduce((a, r) => ({ net: a.net + r.net, pnl: a.pnl + r.pnl }), { net: 0, pnl: 0 });
  // Démo : aperçu des animations, sur une carte récente de chaque niveau de rareté
  el.querySelector('.cel-try')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-try]'); if (!b) return;
    b.disabled = true;
    try {
      const rows = await S.api.searchCards({ limit: 4000, sort: 'date' });
      const t = b.dataset.try, c = rows.find(x => (x.image_large || x.image_small) && (t === 'sell' ? celebrationTier(x) >= 3 : celebrationTier(x) === +t));
      if (c) await (t === 'sell' ? celebrateSell(c, { net: 48.5, pnl: 12.3, before: sold().net }) : celebrateBuy(c, { price: c.price }));
    } finally { b.disabled = false; }
  });

  const draw = async () => {
    const { sum, txs, meta } = pf, pos = sum.pos;
    const invested = pos.reduce((a, p) => a + p.cost, 0);
    $('#pf-kpis').innerHTML = `<div class="pnl-hero ${sum.pnl >= 0 ? 'is-up' : 'is-down'}"><div><span class="l">${sum.pnl >= 0 ? 'Plus-value' : 'Moins-value'} totale</span>
        <span class="v">${sg(sum.pnl)}</span><span class="d">${sum.pnlPct == null ? '' : pc(sum.pnlPct) + ' du capital investi'}</span></div>
        <div class="pnl-split"><span>Latente <b>${sg(sum.latent)}</b></span><span>Réalisée <b>${sg(sum.realizedPnl)}</b></span></div></div>`
      + kpis([['Capital investi', eur(sum.invested), 'tous les achats, frais compris'], ['Valeur à la cote', eur(sum.value), `${sum.cards} article(s) détenu(s)${pos.some(p => p.price == null) ? ', ceux sans cote comptés à leur prix de revient' : ''}`],
        ['Prix de revient des positions', eur(invested)], ['Net si tout vendu', eur(sum.net), pos.some(p => p.price == null) ? 'après frais de revente, articles cotés seulement' : 'après frais de revente'],
        ['Ventes gagnantes', sum.winRate == null ? '—' : Math.round(sum.winRate * 100) + ' %', `${sum.realized.length} vente(s)`]]);
    $('#pf-pos').innerHTML = !pos.length ? '<div class="empty">Aucune position. Notez votre premier achat ci-dessus : cherchez la carte ou le produit, indiquez le prix payé et enregistrez.</div>'
      : `<div class="tbl"><table><thead><tr><th>Article</th>${pro ? '<th>Conseil</th>' : ''}<th class="n">Qté</th><th class="n">Prix de revient</th><th class="n">Cote</th><th class="n">Valeur</th><th class="n">Plus-value</th>${pro ? '<th class="n">Poids</th><th class="n">Vendre au-dessus de</th>' : ''}</tr></thead><tbody>` +
        pos.map(p => { const m = meta(p.cid) || {}, lat = p.value == null ? null : p.value - p.cost; return `<tr class="go" tabindex="0" data-card="${esc(p.cid)}">
          <td>${cardCell({ ...m, name: p.name, rarity: isSealed(m) ? PTYPES[m.ptype] : m.rarity, number: isSealed(m) ? '' : m.number }, ' · depuis le ' + fdate(p.since))}</td>${pro ? `<td>${pill(p.sig?.signal)}</td>` : ''}
          <td class="n">${p.q}</td><td class="n">${eur(p.avg)}</td><td class="n">${eur(p.price)}</td><td class="n">${eur(p.value)}</td>
          <td class="n">${lat == null ? '—' : sg(lat) + '<br>' + pc(lat / p.cost)}</td>${pro ? `<td class="n">${(p.w * 100).toFixed(1).replace('.', ',')} %</td><td class="n">${eur(tradeZones(p.sig, true)?.sellAbove)}</td>` : ''}</tr>`; }).join('') + '</tbody></table></div>';
    const R = sum.realized;
    $('#pf-real').innerHTML = !R.length ? '<div class="empty">Aucune vente pour l\'instant. Chaque vente est rapprochée de vos achats les plus anciens (méthode FIFO) pour calculer la plus ou moins-value réalisée.</div>' :
      `<div class="tbl"><table><thead><tr><th>Date</th><th>Article</th><th class="n">Qté</th><th class="n">Prix de revient</th><th class="n">Encaissé net</th><th class="n">Résultat</th><th class="n">Détention</th></tr></thead><tbody>` +
      [...R].reverse().map(r => `<tr><td>${fdate(r.date)}</td><td>${esc(meta(r.card_id)?.name || r.card_id)}</td><td class="n">${r.q}</td><td class="n">${eur(r.cost)}</td><td class="n">${eur(r.net)}</td><td class="n">${sg(r.pnl)} ${r.cost ? pc(r.pnl / r.cost) : ''}</td><td class="n">${r.days ?? '—'} j</td></tr>`).join('') + '</tbody></table></div>';
    $('#tx-body').innerHTML = !txs.length ? '<div class="empty">Vos achats et ventes s\'afficheront ici.</div>' :
      `<div class="tbl"><table><thead><tr><th>Date</th><th>Opération</th><th>Article</th><th class="n">Qté</th><th class="n">Prix</th><th class="n">Frais</th><th>État</th><th>Plateforme</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>` +
      [...txs].sort((a, b) => b.date.localeCompare(a.date)).map(t => `<tr><td>${fdate(t.date)}</td><td>${t.side === 'buy' ? '<span class="pill p-buy">ACHAT</span>' : '<span class="pill p-sell">VENTE</span>'}</td>
        <td>${esc(meta(t.card_id)?.name || t.card_id)}<div class="meta">${esc(meta(t.card_id)?.set_name || '')}</div></td><td class="n">${t.quantity}</td><td class="n">${eur(t.unit_price)}</td><td class="n">${eur(t.fees)}</td><td>${esc(t.condition)}</td><td>${esc(t.platform || '')}</td>
        <td><button class="btn small danger" type="button" data-del="${esc(t.id)}">Supprimer</button></td></tr>`).join('') + '</tbody></table></div>';
    if (pro) drawPfPerf(await S.api.myPerformance().catch(() => []));
    else $('#pf-perf-note').textContent = '';
  };
  const load = async () => { try { pf = await loadPortfolio(); await draw(); preview(); } catch (e) { $('#pf-pos').innerHTML = `<div class="empty">Chargement impossible : ${esc(errText(e))}</div>`; } };

  $('#tx-body').addEventListener('click', async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Confirmer'; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = 'Supprimer'; } }, 4000); return; }
    b.disabled = true;
    try { await S.api.deleteTransaction(b.dataset.del); toast('Opération supprimée.'); load(); } catch (err) { toast(errText(err), 'err'); b.disabled = false; }
  });
  $('#tx-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#tx-msg'), say = (t, ok) => { msg.textContent = t; msg.className = 'msg ' + (ok ? 'ok' : 'err'); };
    if (!pick || $('#tx-q').dataset.cardId !== pick.id) { say('Choisissez la carte ou le produit dans la liste de suggestions.'); return; }
    const qty = parseInt($('#tx-qty').value, 10), price = parseFloat($('#tx-price').value), fees = parseFloat($('#tx-fees').value || '0');
    const date = $('#tx-date').value || today();
    if (!(qty > 0) || !(price >= 0) || !(fees >= 0)) { say('Indiquez une quantité et des montants valides.'); return; }
    if (side === 'sell' && qty > held(pick.id, date)) { say(`Vente impossible : vous détenez ${held(pick.id, date)} exemplaire(s) au ${fdate(date)}.`); return; }
    $('#tx-save').disabled = true;
    try {
      await S.api.addTransaction({ card_id: pick.id, side, date, quantity: qty, unit_price: price, fees, condition: $('#tx-cond').value, platform: $('#tx-plat').value.trim() || null });
      say(`${side === 'buy' ? 'Achat enregistré' : 'Vente enregistrée'} : ${qty} × ${pick.name} à ${eur(price)}.`, true);
      const item = pick, cash = sold();
      pick = null; $('#tx-q').value = ''; $('#tx-q').dataset.cardId = ''; $('#tx-price').value = ''; $('#tx-fees').value = '0'; $('#tx-qty').value = '1';
      await load();
      // Mise en scène : la carte rejoint le Pokédex, ou se change en pièces qui rejoignent la cagnotte (résultat FIFO exact)
      if (side === 'buy') await celebrateBuy(item, { qty, price });
      else { const now = sold(); await celebrateSell(item, { qty, net: now.net - cash.net, pnl: now.pnl - cash.pnl, before: cash.net }); }
    } catch (err) { say(errText(err)); }
    $('#tx-save').disabled = false;
  });
  load();
}

function drawPfPerf(perf) {
  const pts = perf.filter(x => x.value != null);
  if (pts.length < 2) {
    $('#pf-perf')?.closest('.chart')?.remove();
    $('#pf-perf-empty').textContent = 'La courbe se construit jour après jour dès votre premier achat noté.';
    return;
  }
  const last = pts[pts.length - 1];
  $('#pf-perf-note').innerHTML = `${last.pnl_pct == null ? '' : pc(last.pnl_pct, 1) + ' depuis le ' + fdate(pts[0].date) + ' · '}valeur ${eur(last.value)} pour ${eur(last.invested)} investis`;
  if (!$('#pf-perf')) return;
  chart('pf-perf', { type: 'line', data: { labels: pts.map(x => x.date), datasets: [
    { label: 'Valeur à la cote (€)', data: pts.map(x => x.value), borderColor: cssVar('--accent'), borderWidth: 2, fill: { target: 1, above: cssVar('--up-bg'), below: cssVar('--down-bg') } },
    { label: 'Capital investi (€)', data: pts.map(x => x.invested), borderColor: cssVar('--muted'), borderWidth: 1.5, borderDash: [5, 4], stepped: true }] },
    options: chartBase() });
}
