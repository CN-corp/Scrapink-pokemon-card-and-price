// Tableau de bord de l'espace utilisateur. Compte gratuit : valeur de la collection à la cote, alertes, wishlist,
// master sets. Pro en plus : résultat et plus-values, courbe de performance, opportunités du jour.
import { $, esc, eur, sg, pc, fdate, cssVar } from '../util.js';
import { S, hasPro, isProPlan, isMod } from '../state.js';
import { kpis, needLogin, pill, cardCell, noticeHTML, ring, proTag, chart, chartBase, proHint, lockChip } from '../ui.js';
import { copyShareLink } from './community.js';
import { loadPortfolio } from '../portfolio.js';
import { completion } from './mastersets.js';
import { loadSets } from './catalog.js';
import { alertHit } from './wishlist.js';
import { espaceNav } from './subnav.js';

export async function renderDashboard(el) {
  if (!S.user) { el.innerHTML = needLogin('votre espace'); return; }
  const p = S.profile || {};
  el.innerHTML = `${espaceNav('espace')}
    <div class="page-title"><div><h1>Bonjour ${esc(p.pseudo || '')}</h1><p class="sub">${isProPlan() ? `Membre Pro${p.pro_until ? ' jusqu\'au ' + fdate(p.pro_until) : ''}` : isMod() ? 'Équipe de modération (accès Pro inclus)' : 'Compte gratuit'}</p></div>
      ${hasPro() ? '' : '<a class="btn gold" href="#/abonnement">Passer Pro</a>'}</div>
    <div id="db-ann" class="view"></div><div id="db-kpis"><div class="sub">Chargement…</div></div>
    <section class="panel"><div class="head"><div><h2>Performance de mon compte ${hasPro() ? '' : proTag()}</h2><div class="sub" id="db-perf-note"></div></div><div class="row" id="db-share"></div></div>
      ${hasPro() ? '<div class="chart"><canvas id="db-perf" aria-label="Performance de mon portefeuille dans le temps"></canvas></div>' : proHint('Courbe de performance et évolution de la valeur de votre portefeuille, jour après jour.')}<div class="sub" id="db-perf-empty"></div></section>
    <div class="grid-2"><section class="panel"><div class="head"><h2>Mes cartes principales</h2><a href="#/pokedex">Tout le Pokédex</a></div><div id="db-pos"></div></section>
      <section class="panel"><div class="head"><h2>Alertes et cibles atteintes</h2><a href="#/wishlist">Wishlist et alertes</a></div><div id="db-alerts"></div></section></div>
    <div class="grid-2"><section class="panel"><div class="head"><h2>Master sets épinglés</h2><a href="#/master-sets">Tous</a></div><div class="chips" id="db-ms"></div></section>
      <section class="panel"><div class="head"><h2>Opportunités du jour ${hasPro() ? '' : proTag()}</h2><a href="#/marche">Marché</a></div><div id="db-opp"></div></section></div>`;
  $('#db-ann').innerHTML = S.announcements.map(a => noticeHTML(a, false)).join('');
  const [pf, alerts, follows, owned, perf] = await Promise.all([loadPortfolio(), S.api.alerts().catch(() => []), S.api.masterSets().catch(() => []), S.api.owned().catch(() => []), hasPro() ? S.api.myPerformance().catch(() => []) : []]);
  if (!$('#db-kpis')) return;
  const s = pf.sum;
  // Valeur de la collection cochée dans les master sets (un exemplaire = la cote de la carte)
  const ownedCards = owned.length ? new Map((await S.api.cardsByIds([...new Set(owned.map(o => o.card_id))])).map(c => [c.id, c])) : new Map();
  const colValue = owned.reduce((a, o) => a + (ownedCards.get(o.card_id)?.price || 0) * o.qty, 0);
  const colCount = owned.reduce((a, o) => a + o.qty, 0);
  const alertCards = alerts.length ? new Map((await S.api.cardsByIds(alerts.map(a => a.card_id))).map(c => [c.id, c])) : new Map();
  const fired = alerts.filter(a => a.active && (a.triggered_at || alertHit(a, alertCards.get(a.card_id)?.price)));
  const targets = pf.wish.filter(w => w.target_price != null && pf.priceOf(w.card_id) != null && pf.priceOf(w.card_id) <= w.target_price);
  const pro = hasPro(), atCote = s.pos.reduce((a, x) => a + (x.value || 0), 0);
  $('#db-kpis').innerHTML = kpis([...(pro ? [['Valeur du portefeuille', eur(s.value)], ['Résultat total', sg(s.pnl), s.pnlPct == null ? '' : pc(s.pnlPct) + ' du capital investi'],
    ['Plus-value latente', sg(s.latent)], ['Plus-value réalisée', sg(s.realizedPnl)]] : [['Valeur de mon Pokédex', eur(atCote), `${s.cards} carte(s) à la cote du jour`]]),
    ['Alertes déclenchées', fired.length], ['Cibles wishlist atteintes', targets.length], ['Valeur de ma collection', eur(colValue), `${colCount} carte(s) cochée(s) dans les master sets`]]);
  drawPerf(perf, p);
  $('#db-pos').innerHTML = s.pos.length ? `<div class="tbl short"><table><tbody>${s.pos.slice(0, 5).map(x => `<tr class="go" tabindex="0" data-card="${esc(x.cid)}"><td>${cardCell({ ...(pf.meta(x.cid) || {}), name: x.name })}</td>
      <td class="n">${eur(x.value)}${x.value == null || !pro ? '' : '<br>' + pc((x.value - x.cost) / x.cost)}</td>${pro ? `<td>${pill(x.sig?.signal)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Aucune carte pour l\'instant. <a href="#/pokedex">Ajoutez votre premier achat</a>.</div>';
  const items = [...fired.map(a => ({ c: alertCards.get(a.card_id), t: `Alerte : cote ${a.direction === 'above' ? 'au-dessus de' : 'sous'} ${eur(a.price)}` })),
    ...targets.map(w => ({ c: pf.meta(w.card_id), t: `Cible wishlist ${eur(w.target_price)} atteinte` }))].filter(x => x.c);
  $('#db-alerts').innerHTML = items.length ? `<div class="tbl short"><table><tbody>${items.map(x => `<tr class="go" tabindex="0" data-card="${esc(x.c.id)}"><td>${cardCell(x.c)}</td><td class="n">${eur(x.c.price)}</td><td><span class="pill p-warn">${esc(x.t)}</span></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Rien à signaler aujourd\'hui.</div>';
  const pins = follows.filter(f => f.pinned);
  if (pins.length) {
    const sets = await loadSets(), byId = new Map(sets.map(x => [x.id, x])), om = new Map(owned.map(o => [`${o.card_id}|${o.variant}`, o.qty]));
    const chips = await Promise.all(pins.map(async f => {
      const st = byId.get(f.set_id); if (!st) return '';
      const cards = S.setCards[f.set_id] ||= await S.api.setCards(f.set_id), k = completion(cards, om, f.variant_mode);
      return `<a class="chip" href="#/master-sets/${encodeURIComponent(f.set_id)}">${ring(k.have, k.total, 30, false)}<span>${esc(st.name)}</span><span class="meta">${k.have}/${k.total}</span></a>`;
    }));
    if ($('#db-ms')) $('#db-ms').innerHTML = chips.join('');
  } else $('#db-ms').innerHTML = '<span class="sub">Épinglez une extension dans Master sets pour la retrouver ici.</span>';
  let opp = [];
  try { opp = hasPro() ? await S.api.market({ kind: 'buy', limit: 5 }) : await S.api.teaser(); } catch (e) { opp = []; }
  if ($('#db-opp')) $('#db-opp').innerHTML = opp.length ? `<div class="tbl short"><table><tbody>${opp.slice(0, 5).map(r => `<tr class="go" tabindex="0" data-card="${esc(r.card_id)}"><td>${cardCell(r)}</td><td>${r.signal ? pill(r.signal) : lockChip()}</td><td class="n">${eur(r.price)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Pas d\'opportunité disponible.</div>';
}

function drawPerf(perf, p) {
  const share = $('#db-share');
  if (share) share.innerHTML = p.share_portfolio && p.share_slug
    ? `<a class="btn small" href="#/membre/${encodeURIComponent(p.share_slug)}">Ma vitrine publique</a><button class="btn small" type="button" id="db-copy">Copier le lien</button>`
    : '<a class="btn small primary" href="#/profil">Partager mon portefeuille</a>';
  $('#db-copy')?.addEventListener('click', () => copyShareLink(p.share_slug));
  if (!$('#db-perf')) return; // compte gratuit : courbe réservée Pro
  const pts = perf.filter(x => x.pnl_pct != null);
  if (pts.length < 2) {
    $('#db-perf')?.closest('.chart')?.remove();
    const e = $('#db-perf-empty'); if (e) e.textContent = 'La courbe se construit jour après jour dès votre premier achat noté dans le Pokédex.';
    return;
  }
  const last = pts[pts.length - 1];
  $('#db-perf-note').innerHTML = `${pc(last.pnl_pct, 1)} depuis le ${fdate(pts[0].date)} · valeur ${eur(last.value)}`;
  chart('db-perf', { type: 'line', data: { labels: pts.map(x => x.date), datasets: [
    { label: 'Performance (%)', data: pts.map(x => x.pnl_pct), borderColor: cssVar('--accent'), borderWidth: 2, yAxisID: 'y' },
    { label: 'Valeur (€)', data: pts.map(x => x.value), borderColor: cssVar('--gold'), borderWidth: 2, yAxisID: 'y1' }] },
    options: chartBase({ scales: { x: { ticks: { color: cssVar('--muted'), maxTicksLimit: 7 }, grid: { color: cssVar('--line') } },
      y: { ticks: { color: cssVar('--muted'), callback: v => v + ' %' }, grid: { color: cssVar('--line') } },
      y1: { position: 'right', ticks: { color: cssVar('--muted') }, grid: { display: false } } } }) });
}
