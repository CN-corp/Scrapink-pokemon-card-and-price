// Rapports mensuels (Pro) : valeur début / fin, achats, ventes, réalisé, résultat du mois, conseils.
import { $, esc, eur, sg, pc, fdate, cssVar } from '../util.js';
import { S, hasPro } from '../state.js';
import { locked, needLogin, kpis, pill, chart, chartBase } from '../ui.js';
import { monthsOf, monthlyReport } from '../fifo.js';
import { loadPortfolio } from '../portfolio.js';
import { espaceNav } from './subnav.js';

const monthName = m => new Date(m + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

export async function renderReports(el) {
  if (!S.user) { el.innerHTML = needLogin('vos rapports'); return; }
  el.innerHTML = `${espaceNav('rapports')}<div id="r-main" class="view"><div class="sub">Chargement…</div></div>`;
  if (!hasPro()) { $('#r-main').innerHTML = locked({ title: 'Votre rapport du mois', text: 'Chaque mois : valeur de votre collection en début et fin de mois, achats, ventes, plus-values réalisées et latentes, conseils du moment.' }); return; }
  const pf = await loadPortfolio();
  const months = monthsOf(pf.txs);
  if (!months.length) { $('#r-main').innerHTML = '<div class="empty">Un rapport est produit pour chaque mois à partir de votre premier achat. Ajoutez vos achats dans le Pokédex.</div>'; return; }
  const ids = [...new Set(pf.txs.map(t => t.card_id))];
  let hist = {};
  try { hist = await S.api.histories(ids); } catch (e) { hist = {}; }
  const histOf = id => hist[id] || [];
  const all = months.map(m => monthlyReport(pf.txs, m, histOf, pf.priceOf));
  $('#r-main').innerHTML = `<section class="panel"><div class="head"><h2>Résultat mois par mois</h2><span class="sub">Variation de valeur + ventes − achats</span></div><div class="chart s"><canvas id="r-chart" aria-label="Résultat mensuel"></canvas></div></section>
    <section class="panel"><div class="form"><label for="r-month">Mois<select id="r-month">${months.map(m => `<option value="${m}">${monthName(m)}</option>`).join('')}</select></label>
      <button class="btn" type="button" id="r-print">Imprimer</button></div><div id="r-body"></div></section>`;
  const asc = [...all].reverse();
  chart('r-chart', { type: 'bar', data: { labels: asc.map(r => monthName(r.month)), datasets: [{ label: 'Résultat du mois', data: asc.map(r => +r.result.toFixed(2)), backgroundColor: asc.map(r => r.result >= 0 ? cssVar('--up') : cssVar('--down')) }] },
    options: chartBase({ plugins: { legend: { display: false } } }) });
  const name = id => pf.meta(id)?.name || id;
  const draw = () => {
    const r = all.find(x => x.month === $('#r-month').value);
    const advice = pf.sum.pos.filter(p => p.sig && /VENDRE|ALLÉGER|RENFORCER/.test(p.sig.signal));
    $('#r-body').innerHTML = `<h2 style="font-size:22px;text-transform:capitalize">${monthName(r.month)}</h2>
      ${kpis([['Valeur début', eur(r.valueStart)], ['Valeur fin', eur(r.valueEnd)], ['Achats', eur(r.spent), `${r.buys.length} transaction(s)`], ['Ventes', eur(r.cashed), `${r.sells.length} transaction(s)`],
        ['Plus-value réalisée', sg(r.realizedPnl)], ['Résultat du mois', sg(r.result)]])}
      <h3>Ventes du mois</h3>${r.realized.length ? `<div class="tbl short"><table><thead><tr><th>Date</th><th>Carte</th><th class="n">Qté</th><th class="n">Coût FIFO</th><th class="n">Encaissé net</th><th class="n">Résultat</th></tr></thead><tbody>${r.realized.map(x =>
        `<tr><td>${fdate(x.date)}</td><td>${esc(name(x.card_id))}</td><td class="n">${x.q}</td><td class="n">${eur(x.cost)}</td><td class="n">${eur(x.net)}</td><td class="n">${sg(x.pnl)} ${x.cost ? pc(x.pnl / x.cost) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Aucune vente ce mois-ci.</p>'}
      <h3>Achats du mois</h3>${r.buys.length ? `<div class="tbl short"><table><thead><tr><th>Date</th><th>Carte</th><th class="n">Qté</th><th class="n">Prix</th><th class="n">Cote actuelle</th></tr></thead><tbody>${r.buys.map(t =>
        `<tr><td>${fdate(t.date)}</td><td>${esc(name(t.card_id))}</td><td class="n">${t.quantity}</td><td class="n">${eur(t.unit_price)}</td><td class="n">${eur(pf.priceOf(t.card_id))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Aucun achat ce mois-ci.</p>'}
      <h3>Conseils à date</h3>${advice.length ? `<div class="tbl short"><table><tbody>${advice.map(p => `<tr class="go" tabindex="0" data-card="${esc(p.cid)}"><td>${esc(p.name)}</td><td>${pill(p.sig.signal)}</td><td class="why">${[...p.sig.reasons_sell, ...p.sig.reasons_buy].slice(0, 2).map(esc).join(' · ')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Rien à signaler sur vos cartes.</p>'}`;
  };
  $('#r-month').addEventListener('change', draw);
  $('#r-print').addEventListener('click', () => { $('#print-area').innerHTML = $('#r-body').innerHTML; try { window.print(); } catch (e) { /* impression bloquée */ } });
  draw();
}
