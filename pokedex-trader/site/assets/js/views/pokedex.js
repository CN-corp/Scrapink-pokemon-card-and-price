// Pokédex (compte gratuit) : cartes et produits détenus (classeur ou tableau) avec leur quantité et leur valeur à la cote.
// Les achats et les ventes se notent dans Mon portefeuille (views/portefeuille.js), qui calcule les plus-values.
// Pro en plus : prix de revient, plus-value latente et conseil sur chaque carte.
import { $, esc, eur, pc, sg, fdate, errText, store } from '../util.js';
import { hasPro, S } from '../state.js';
import { kpis, pill, cardCell, frame, needLogin, proHint } from '../ui.js';
import { isGraded } from '../grading.js';
import { loadPortfolio } from '../portfolio.js';
import { tradeZones } from '../advice.js';
import { espaceNav } from './subnav.js';

export async function renderPokedex(el, params) {
  if (!S.user) { el.innerHTML = needLogin('votre Pokédex'); return; }
  el.innerHTML = `${espaceNav('pokedex')}<div id="pd-kpis"></div>
    <section class="panel pf-cta"><div><h2>Un achat, une vente ?</h2><div class="sub">Notez-les dans votre portefeuille : quantités, valeur et plus-values se mettent à jour ici.</div></div>
      <a class="btn primary" href="#/portefeuille">Noter un achat ou une vente</a></section>
    <section class="panel"><div class="head"><div><h2>Mes cartes</h2><div class="sub" id="pd-note"></div></div>
      <div class="seg" role="group" aria-label="Affichage"><button type="button" id="v-binder">Classeur</button><button type="button" id="v-table">Tableau</button></div></div><div id="pos-body"><div class="sub">Chargement…</div></div></section>
    `;

  let view = store.get('pt-view', 'binder');
  let pf;
  const draw = () => {
    const { sum, txs, meta } = pf, pos = sum.pos, pro = hasPro();
    // Valeur à la cote des seules cartes cotées (le compte gratuit ne voit pas les prix de revient)
    const atCote = pos.reduce((a, p) => a + (p.value || 0), 0);
    $('#pd-kpis').innerHTML = kpis(pro ? [['Cartes détenues', sum.cards], ['Valeur à la cote', eur(sum.value)], ['Net si tout vendu', eur(sum.net)],
      ['Plus-value latente', sg(sum.latent)], ['Plus-value réalisée', sg(sum.realizedPnl)], ['Ventes gagnantes', sum.winRate == null ? '—' : Math.round(sum.winRate * 100) + ' %']]
      : [['Cartes détenues', sum.cards], ['Cartes différentes', pos.length], ['Valeur à la cote', eur(atCote)], ['Net si tout vendu', eur(sum.net), 'après frais de revente'],
        ['Transactions', txs.length, `${txs.filter(t => t.side === 'buy').length} achat(s) · ${txs.filter(t => t.side === 'sell').length} vente(s)`]])
      + (pro ? '' : proHint('Prix de revient, plus-values réalisées et latentes (FIFO), performance et conseils de vente sur vos cartes.'));
    $('#pd-note').textContent = pro ? 'Conseils personnalisés : analyse du jour croisée avec votre prix de revient et le poids de chaque carte.' : 'Quantités et valeur à la cote du jour.';
    $('#v-binder').setAttribute('aria-pressed', view === 'binder'); $('#v-table').setAttribute('aria-pressed', view === 'table');
    const lastCond = cid => txs.filter(t => t.card_id === cid && t.side === 'buy').sort((a, b) => b.date.localeCompare(a.date))[0]?.condition;
    $('#pos-body').innerHTML = !pos.length ? '<div class="empty">Votre Pokédex est vide. <a href="#/portefeuille">Notez votre premier achat</a> : cherchez la carte, indiquez le prix payé et enregistrez.</div>' :
      view === 'binder' ? `<div class="binder">${pos.map(p => { const cd = lastCond(p.cid), c = meta(p.cid) || p; return `<button class="tile" type="button" data-card="${esc(p.cid)}">
        ${frame(c, (isGraded(cd) ? `<span class="grade">${esc(cd)}</span>` : '') + (p.q > 1 ? `<span class="qty">×${p.q}</span>` : ''))}
        <span class="t1">${esc(p.name)}</span><span class="meta">${esc(p.set_name || '')}</span>
        <span class="t2"><span>${p.q > 1 && p.value != null ? `${eur(p.value)} <span class="meta">(${p.q} × ${eur(p.price)})</span>` : eur(p.price)}</span>${p.value == null || !pro ? '' : pc((p.value - p.cost) / p.cost)}</span>${p.sig ? pill(p.sig.signal) : ''}</button>`; }).join('')}</div>` :
      !pro ? `<div class="tbl"><table><thead><tr><th>Carte</th><th class="n">Qté</th><th class="n">Cote</th><th class="n">Valeur</th></tr></thead><tbody>` +
      pos.map(p => `<tr class="go" tabindex="0" data-card="${esc(p.cid)}"><td>${cardCell({ ...(meta(p.cid) || {}), name: p.name }, ' · depuis le ' + fdate(p.since))}</td>
        <td class="n">${p.q}</td><td class="n">${eur(p.price)}</td><td class="n">${eur(p.value)}</td></tr>`).join('') + '</tbody></table></div>' :
      `<div class="tbl"><table><thead><tr><th>Carte</th><th>Conseil</th><th class="n">Qté</th><th class="n">Prix de revient</th><th class="n">Cote</th><th class="n">Latent</th><th class="n">Poids</th><th class="n">Estimé 30 j</th><th class="n">Vendre au-dessus de</th><th>Pourquoi</th></tr></thead><tbody>` +
      pos.map(p => `<tr class="go" tabindex="0" data-card="${esc(p.cid)}"><td>${cardCell({ ...(meta(p.cid) || {}), name: p.name }, ' · depuis le ' + fdate(p.since))}</td><td>${pill(p.sig?.signal)}</td>
        <td class="n">${p.q}</td><td class="n">${eur(p.avg)}</td><td class="n">${eur(p.price)}</td><td class="n">${p.value == null ? '—' : sg(p.value - p.cost) + '<br>' + pc((p.value - p.cost) / p.cost)}</td>
        <td class="n">${(p.w * 100).toFixed(1).replace('.', ',')} %</td><td class="n">${eur(p.sig?.est30)}</td><td class="n">${eur(tradeZones(p.sig, true)?.sellAbove)}</td><td class="why">${[...(p.sig?.reasons_sell || []), ...(p.sig?.reasons_buy || [])].slice(0, 3).map(esc).join(' · ')}</td></tr>`).join('') + '</tbody></table></div>';
  };
  const load = async () => { try { pf = await loadPortfolio(); draw(); } catch (e) { $('#pos-body').innerHTML = `<div class="empty">Chargement impossible : ${esc(errText(e))}</div>`; } };
  const setView = v => { view = v; store.set('pt-view', v); draw(); };
  $('#v-binder').addEventListener('click', () => setView('binder'));
  $('#v-table').addEventListener('click', () => setView('table'));
  load();
}
