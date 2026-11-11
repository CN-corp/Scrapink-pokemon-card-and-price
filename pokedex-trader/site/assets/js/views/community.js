// Communauté : classement des portefeuilles partagés (modérateurs seulement) et vitrine publique d'un membre.
// Le partage est désactivé par défaut, chacun l'active dans Profil ; sans « montants », seuls les pourcentages sont publiés.
import { $, esc, eur, num, pc, sg, fdate, toast, errText, cssVar } from '../util.js';
import { S, hasPro, emit } from '../state.js';
import { kpis, pill, frame, langTag, chart, chartBase, proTag, avatar } from '../ui.js';

const pct = v => v == null ? '—' : pc(v, 1);
export const shareUrl = slug => `${location.origin}${location.pathname}#/membre/${encodeURIComponent(slug)}`;

export async function copyShareLink(slug) {
  const url = shareUrl(slug);
  try { await navigator.clipboard.writeText(url); toast('Lien de votre vitrine copié.'); }
  catch (e) { window.prompt('Copiez le lien de votre vitrine :', url); }
}

/** Bandeau d'invitation selon le visiteur : créer un compte, activer le partage, ou voir sa vitrine */
function joinBox() {
  const p = S.profile;
  if (!S.user) return `<section class="cta-band"><div><h2>Et vous, quelle est votre performance ?</h2><p>Créez un compte gratuit, notez vos achats et ventes, et partagez à votre tour votre vitrine.</p></div><a class="btn gold big" href="#/inscription">Je crée mon compte</a></section>`;
  if (!p?.share_portfolio) return `<section class="cta-band"><div><h2>Montrez votre collection</h2><p>Partagez votre portefeuille : vos cartes et votre performance en pourcentage. Les montants restent privés, sauf si vous choisissez de les afficher.</p></div><button class="btn gold big" type="button" id="cm-join">Partager mon portefeuille</button></section>`;
  return `<section class="cta-band"><div><h2>Votre vitrine est en ligne</h2><p>Envoyez-la à vos amis ou sur vos réseaux. Vous pouvez couper le partage à tout moment dans Profil.</p></div>
    <div class="row"><a class="btn big" href="#/membre/${encodeURIComponent(p.share_slug)}">Voir ma vitrine</a><button class="btn gold big" type="button" data-copy-share="${esc(p.share_slug)}">Copier le lien</button></div></section>`;
}
function bindJoin(el) {
  el.addEventListener('click', async e => {
    if (e.target.closest('#cm-join')) {
      try { await S.api.updateSharing({ share_portfolio: true }); toast('Portefeuille partagé : votre vitrine est en ligne.'); emit('profile'); }
      catch (err) { toast(errText(err), 'err'); }
    }
    const c = e.target.closest('[data-copy-share]'); if (c) copyShareLink(c.dataset.copyShare);
  });
}

export function leaderRow(r) {
  return `<a class="lb-row" href="#/membre/${encodeURIComponent(r.slug)}"><span class="rk">${r.rank}</span>
    <span class="avatar" aria-hidden="true">${esc((r.pseudo || '?').slice(0, 1).toUpperCase())}</span>
    <span class="who"><b>${esc(r.pseudo)}</b>${r.pro ? proTag() : ''}<span class="meta">${num(r.cards)} carte(s) · ${num(r.trades)} transaction(s)</span></span>
    <span class="perf">${pct(r.pnl_pct)}<span class="meta">${r.value != null ? eur(r.value) : 'montants privés'}</span></span></a>`;
}

export async function renderCommunity(el) {
  el.innerHTML = `<div class="page-title"><div><h1>Communauté</h1><p class="sub">Réservé à l'équipe de modération. Les membres qui partagent leur portefeuille, classés par performance : plus-values réalisées et latentes, rapportées au capital investi.</p></div></div>
    <div id="cm-kpis"></div><div id="cm-podium" class="podium"></div>
    <section class="panel"><div class="head"><h2>Classement</h2><span class="sub">Mis à jour chaque matin avec les cotes du jour</span></div><div id="cm-list"><div class="sub">Chargement…</div></div></section>
    ${joinBox()}`;
  bindJoin(el);
  let rows = [];
  try { rows = await S.api.leaderboard(100); } catch (e) { $('#cm-list').innerHTML = `<div class="empty">Chargement impossible : ${esc(errText(e))}</div>`; return; }
  if (!$('#cm-list')) return;
  if (!rows.length) { $('#cm-list').innerHTML = '<div class="empty">Personne n\'a encore partagé son portefeuille. Soyez le premier !</div>'; return; }
  const avg = rows.reduce((a, r) => a + (r.pnl_pct || 0), 0) / rows.length;
  $('#cm-kpis').innerHTML = kpis([['Portefeuilles partagés', num(rows.length)], ['Performance moyenne', pct(avg)], ['Meilleure performance', pct(rows[0].pnl_pct), esc(rows[0].pseudo)],
    ['Cartes exposées', num(rows.reduce((a, r) => a + r.cards, 0))]]);
  $('#cm-podium').innerHTML = rows.slice(0, 3).map(r => `<a class="pod pod-${r.rank}" href="#/membre/${encodeURIComponent(r.slug)}">
    <span class="medal" aria-label="Rang ${r.rank}">${r.rank}</span>${frame({ name: r.top_name, image_small: r.top_image })}
    <b>${esc(r.pseudo)}</b>${r.pro ? proTag() : ''}<span class="perf">${pct(r.pnl_pct)}</span><span class="meta">${r.top_name ? 'Carte phare : ' + esc(r.top_name) : ''}</span></a>`).join('');
  $('#cm-list').innerHTML = `<div class="lb">${rows.map(leaderRow).join('')}</div>`;
}

export async function renderMember(el, slug) {
  el.innerHTML = '<div class="panel"><div class="sub">Chargement de la vitrine…</div></div>';
  let m = null;
  try { m = await S.api.publicPortfolio(slug); } catch (e) { el.innerHTML = `<div class="panel"><h2>Vitrine indisponible</h2><p class="sub">${esc(errText(e))}</p></div>`; return; }
  if (!m) { el.innerHTML = '<div class="panel" style="text-align:center"><h1 style="font-size:24px">Vitrine introuvable</h1><p class="sub">Ce lien n\'existe pas, ou son propriétaire a coupé le partage.</p><div><a class="btn primary" href="#/communaute">Voir la communauté</a></div></div>'; return; }
  document.title = `Vitrine de ${m.pseudo} · Pokédex Trader`;
  const mine = S.profile?.share_slug === m.slug, amt = m.amounts, pro = hasPro();
  el.innerHTML = `<div class="page-title member-head"><div class="row" style="gap:14px">${avatar(m.pseudo, m.avatar_url, 'big')}
      <div><h1>${esc(m.pseudo)} ${m.pro ? proTag() : ''}</h1><p class="sub">Membre depuis le ${fdate(m.member_since)}${m.rank ? ` · ${m.rank}<sup>${m.rank === 1 ? 'er' : 'e'}</sup> du classement` : ''}</p></div></div>
      <div class="row"><button class="btn" type="button" data-copy-share="${esc(m.slug)}">Partager cette vitrine</button>${mine ? '<a class="btn" href="#/profil">Réglages du partage</a>' : ''}</div></div>
    ${kpis([['Performance', pct(m.pnl_pct), 'réalisé + latent / investi'], ['Valeur à la cote', amt ? eur(m.value) : '—', amt ? '' : 'montant privé'], ['Résultat', amt ? sg(m.pnl) : '—', amt ? `dont ${eur(m.realized)} réalisé` : 'montant privé'],
      ['Cartes', num(m.positions.reduce((a, p) => a + +p.qty, 0))], ['Transactions', num(m.trades)]])}
    <section class="panel"><div class="head"><h2>Évolution de la performance</h2><span class="sub">${m.series.length > 1 ? `du ${fdate(m.series[0].date)} au ${fdate(m.series[m.series.length - 1].date)}` : ''}</span></div>
      ${m.series.length > 1 ? '<div class="chart"><canvas id="mb-chart" aria-label="Performance du portefeuille dans le temps"></canvas></div>' : '<div class="empty">La courbe se construit jour après jour à partir de la première synchronisation.</div>'}</section>
    <section class="panel"><div class="head"><h2>Sa collection</h2><span class="sub">${pro ? 'Avec le signal du jour sur chaque carte' : ''}</span></div>
      ${m.positions.length ? `<div class="binder">${m.positions.map(p => `<button class="tile" type="button" data-card="${esc(p.card_id)}">
        ${frame(p, +p.qty > 1 ? `<span class="qty">×${num(p.qty)}</span>` : '')}<span class="t1">${esc(p.name)}${langTag(p.lang)}</span><span class="meta">${esc(p.set_name || '')}</span>
        <span class="t2"><span>${amt && p.value != null ? eur(p.value) : eur(p.price)}</span>${pct(p.perf_pct)}</span><span data-sig="${esc(p.card_id)}"></span></button>`).join('')}</div>` : '<div class="empty">Aucune carte en ce moment.</div>'}
      </section>
    ${mine ? '' : joinBox()}`;
  bindJoin(el);
  if (m.series.length > 1) {
    const val = amt && m.series.every(x => x.value != null);
    chart('mb-chart', { type: 'line', data: { labels: m.series.map(x => x.date), datasets: [
      { label: 'Performance (%)', data: m.series.map(x => x.pnl_pct), borderColor: cssVar('--accent'), borderWidth: 2, yAxisID: 'y' },
      ...(val ? [{ label: 'Valeur (€)', data: m.series.map(x => x.value), borderColor: cssVar('--gold'), borderWidth: 2, yAxisID: 'y1' }] : [])] },
      options: chartBase({ scales: { x: { ticks: { color: cssVar('--muted'), maxTicksLimit: 7 }, grid: { color: cssVar('--line') } },
        y: { ticks: { color: cssVar('--muted'), callback: v => v + ' %' }, grid: { color: cssVar('--line') } },
        ...(val ? { y1: { position: 'right', ticks: { color: cssVar('--muted') }, grid: { display: false } } } : {}) } }) });
  }
  if (pro && m.positions.length) {
    try {
      const ana = await S.api.analysisByIds(m.positions.map(p => p.card_id));
      for (const a of ana) { const x = el.querySelector(`[data-sig="${CSS.escape(a.card_id)}"]`); if (x) x.innerHTML = pill(a.signal); }
    } catch (e) { /* signaux facultatifs */ }
  }
}

