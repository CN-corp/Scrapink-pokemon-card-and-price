// Espace modérateur : KPI, utilisateurs, annonces, réglages, santé des données, journal.
// Toutes les données viennent de fonctions SQL qui refusent les non-modérateurs.
import { $, esc, eur, num, sg, fdate, fdatetime, toast, errText, debounce, addDays, cssVar } from '../util.js';
import { S, isMod, isAdmin, emit } from '../state.js';
import { kpis, forbidden, needLogin, chart, chartBase, openDialog, noticeHTML } from '../ui.js';
import { loadSets } from './catalog.js';
import { modNav } from './subnav.js';

const roleBadge = r => `<span class="badge-role ${esc(r)}">${esc(r === 'admin' ? 'ADMIN' : r === 'moderator' ? 'MODÉRATEUR' : 'MEMBRE')}</span>`;
const planBadge = u => u.plan === 'pro' && (!u.pro_until || new Date(u.pro_until) > new Date()) ? '<span class="pill p-pro">PRO</span>' : '<span class="pill">GRATUIT</span>';
const ACTIONS = { 'profiles.grant_pro': 'Pro accordé', 'profiles.revoke_pro': 'Pro retiré', 'profiles.set_role': 'Rôle modifié', 'profiles.ban': 'Banni', 'profiles.unban': 'Débanni',
  'profiles.view': 'Fiche consultée', 'announcements.insert': 'Annonce créée', 'announcements.update': 'Annonce modifiée', 'announcements.delete': 'Annonce supprimée',
  'news.insert': 'Actualité créée', 'news.update': 'Actualité modifiée', 'news.delete': 'Actualité supprimée', 'site_settings.update': 'Réglage modifié', 'site_settings.insert': 'Réglage créé', 'stripe.subscription': 'Abonnement Stripe' };

export async function renderModeration(el, sub = '') {
  if (!S.user) { el.innerHTML = needLogin('la modération'); return; }
  if (!isMod()) { el.innerHTML = forbidden(); return; }
  el.innerHTML = `<div class="page-title"><div><h1>Modération</h1><p class="sub">Connecté en tant que ${esc(S.profile.pseudo)} ${roleBadge(S.profile.role)}</p></div></div>${modNav(sub)}<div id="mod-main" class="view"><div class="sub">Chargement…</div></div>`;
  const main = $('#mod-main');
  try {
    if (sub === 'utilisateurs') await modUsers(main);
    else if (sub === 'annonces') await modAnnouncements(main);
    else if (sub === 'actus') await modNews(main);
    else if (sub === 'reglages') await modSettings(main);
    else if (sub === 'donnees') await modData(main);
    else if (sub === 'journal') await modAudit(main);
    else await modKpi(main);
  } catch (e) { main.innerHTML = `<div class="empty">Chargement impossible : ${esc(errText(e))}</div>`; }
}

async function modKpi(main) {
  const [k, ts, top] = await Promise.all([S.api.kpiOverview(), S.api.kpiTimeseries(26), S.api.kpiTopUsers(20)]);
  main.innerHTML = `${kpis([['Utilisateurs', num(k.users), `${num(k.active7)} actifs sur 7 j`], ['Abonnés Pro', num(k.pro), `${k.pro_month} mensuels · ${k.pro_year} annuels · ${k.pro_manual} offerts`],
      ['MRR estimé', eur(k.mrr), `${eur(k.price_month)} / mois · ${eur(k.price_year)} / an`], ['Nouveaux inscrits', `${num(k.new7)} <span class="sub">/ 7 j</span>`, `${num(k.new30)} sur 30 jours`],
      ['Churn 30 j', `${String(k.churn_rate).replace('.', ',')} %`, `${k.churn30} abonnement(s) terminé(s)`], ['Conversion gratuit → Pro', `${String(k.conversion).replace('.', ',')} %`, `${k.banned} banni(s) · ${k.staff} modérateur(s)`]])}
    <div class="grid-2"><section class="panel"><h2>Inscriptions par semaine</h2><div class="chart s"><canvas id="k-signups" aria-label="Inscriptions par semaine"></canvas></div></section>
      <section class="panel"><h2>Abonnés Pro actifs</h2><div class="chart s"><canvas id="k-pro" aria-label="Abonnés Pro au fil des semaines"></canvas></div></section></div>
    <section class="panel"><div class="head"><div><h2>Meilleurs portefeuilles</h2><div class="sub">Performance des membres (plus-values réalisées + latentes, FIFO, cotes du jour). Pseudos uniquement ; ouvrez un membre pour le détail.</div></div></div>
      ${top.length >= 1 ? `<div class="podium" aria-label="Podium">${[1, 0, 2].map(i => top[i] ? `<div class="step p${i + 1}"><div class="who">${esc(top[i].pseudo)}</div><div class="sub">${sg(top[i].pnl)} · ${top[i].pnl_pct == null ? '—' : String(top[i].pnl_pct).replace('.', ',') + ' %'}</div><div class="block">${i + 1}</div></div>` : '<div></div>').join('')}</div>` : ''}
      ${top.length ? `<div class="tbl"><table><thead><tr><th class="rk">#</th><th>Membre</th><th>Offre</th><th class="n">P&amp;L €</th><th class="n">P&amp;L %</th><th class="n">Réalisé</th><th class="n">Latent</th><th class="n">Transactions</th><th class="n">Valeur du portefeuille</th></tr></thead><tbody>${top.map(r => `
        <tr class="go" tabindex="0" data-user="${esc(r.user_id)}"><td class="rk">${r.rank}</td><td class="nm">${esc(r.pseudo)}</td><td>${planBadge({ plan: r.plan })}</td><td class="n">${sg(r.pnl)}</td>
        <td class="n">${r.pnl_pct == null ? '—' : `<span class="${r.pnl_pct >= 0 ? 'up' : 'down'}">${r.pnl_pct >= 0 ? '+' : ''}${String(r.pnl_pct).replace('.', ',')} %</span>`}</td><td class="n">${sg(r.realized)}</td><td class="n">${sg(r.latent)}</td><td class="n">${num(r.trades)}</td><td class="n">${eur(r.value)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucun membre n\'a encore saisi de transaction.</div>'}</section>`;
  const labels = ts.map(t => fdate(t.week_start).slice(0, 5));
  chart('k-signups', { type: 'bar', data: { labels, datasets: [{ label: 'Inscriptions', data: ts.map(t => t.signups), backgroundColor: cssVar('--accent') }] }, options: chartBase({ plugins: { legend: { display: false } } }) });
  chart('k-pro', { type: 'line', data: { labels, datasets: [{ label: 'Abonnés Pro', data: ts.map(t => t.pro_active), borderColor: cssVar('--gold'), backgroundColor: cssVar('--gold'), borderWidth: 2, fill: false }] }, options: chartBase({ plugins: { legend: { display: false } } }) });
  main.addEventListener('click', e => { const tr = e.target.closest('[data-user]'); if (tr) openUser(tr.dataset.user); });
}

async function openUser(id, after) {
  const d = openDialog('Membre', '<div class="sub">Chargement…</div>');
  const body = d.querySelector('.dlg-body');
  let r;
  try { r = await S.api.userDetail(id); } catch (e) { body.innerHTML = `<div class="empty">${esc(errText(e))}</div>`; return; }
  const p = r.profile, pf = r.portfolio, self = id === S.user.id, admin = isAdmin();
  const canRole = admin && !self, canBan = !self && (p.role === 'user' || admin);
  $('#dlg-title').textContent = p.pseudo;
  body.innerHTML = `<div class="row">${roleBadge(p.role)}${planBadge(p)}${p.banned ? '<span class="pill p-sell">BANNI</span>' : ''}</div>
    <div class="dgrid">${[['E-mail', esc(p.email || '—')], ['Inscrit le', fdate(p.created_at)], ['Dernière visite', fdatetime(p.last_seen)], ['Pro jusqu\'au', p.pro_until ? fdate(p.pro_until) : '—'],
      ['Formule', esc(p.pro_interval || '—')], ['Client Stripe', p.has_stripe ? 'oui' : 'non'], ['Transactions', num(pf?.trades || 0)], ['Valeur portefeuille', eur(pf?.value)],
      ['P&L réalisé', sg(pf?.realized)], ['P&L latent', sg(pf?.latent)], ['Wishlist / alertes', `${r.counts?.wishlist || 0} / ${r.counts?.alerts || 0}`], ['Master sets', num(r.counts?.master_sets || 0)]]
      .map(([l, v]) => `<div><div class="meta">${l}</div><div>${v}</div></div>`).join('')}</div>
    ${p.banned && p.ban_reason ? `<p class="sub">Motif du bannissement : ${esc(p.ban_reason)}</p>` : ''}
    <form class="form" id="u-pro"><label for="u-until">Accorder Pro jusqu'au<input id="u-until" type="date" value="${addDays(new Date(), 30).toISOString().slice(0, 10)}" required></label>
      <button class="btn gold" type="submit">Accorder Pro</button><button class="btn" type="button" id="u-revoke">Retirer Pro</button></form>
    <form class="form" id="u-role"><label for="u-rolesel">Rôle<select id="u-rolesel"${canRole ? '' : ' disabled'}>${['user', 'moderator', 'admin'].map(x => `<option value="${x}"${p.role === x ? ' selected' : ''}>${x === 'user' ? 'Membre' : x === 'moderator' ? 'Modérateur' : 'Admin'}</option>`).join('')}</select></label>
      <button class="btn" type="submit"${canRole ? '' : ' disabled'}>Changer le rôle</button>${canRole ? '' : `<span class="sub">${self ? 'Vous ne pouvez pas changer votre propre rôle.' : 'Seul un admin peut nommer ou retirer un modérateur.'}</span>`}</form>
    <form class="form" id="u-ban">${p.banned ? `<button class="btn" type="submit"${canBan ? '' : ' disabled'}>Débannir</button>` : `<label for="u-reason">Motif<input id="u-reason" class="w-l" maxlength="300" placeholder="Visible par l'équipe"></label><button class="btn danger" type="submit"${canBan ? '' : ' disabled'}>Bannir</button>`}
      ${canBan ? '' : `<span class="sub">${self ? 'Action impossible sur votre propre compte.' : 'Seul un admin peut bannir un modérateur.'}</span>`}</form>
    <div class="msg" id="u-msg" role="alert"></div>
    <h3>Historique des actions</h3>${r.audit?.length ? `<div class="tbl short"><table><tbody>${r.audit.map(a => `<tr><td>${fdatetime(a.at)}</td><td>${esc(a.actor_pseudo || 'système')}</td><td>${esc(ACTIONS[a.action] || a.action)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Aucune action enregistrée.</p>'}`;
  const run = async fn => { try { await fn(); toast('Modification enregistrée.'); if (self) emit('profile'); after?.(); openUser(id, after); } catch (e) { $('#u-msg').textContent = errText(e); $('#u-msg').className = 'msg err'; } };
  $('#u-pro').addEventListener('submit', e => { e.preventDefault(); run(() => S.api.setPro(id, $('#u-until').value + 'T23:59:59')); });
  $('#u-revoke').addEventListener('click', () => run(() => S.api.setPro(id, null)));
  $('#u-role').addEventListener('submit', e => { e.preventDefault(); run(() => S.api.setRole(id, $('#u-rolesel').value)); });
  $('#u-ban').addEventListener('submit', e => { e.preventDefault(); run(() => S.api.setBanned(id, !p.banned, $('#u-reason')?.value.trim())); });
}

async function modUsers(main) {
  main.innerHTML = `<section class="panel"><form class="form" role="search" onsubmit="return false"><label for="mu-q" style="flex:1 1 260px">Rechercher (pseudo, e-mail ou identifiant)<input id="mu-q" type="search" autocomplete="off"></label></form><div id="mu-body"><div class="sub">Chargement…</div></div></section>`;
  let off = 0, seq = 0;
  const load = async () => {
    const my = ++seq, res = await S.api.searchUsers($('#mu-q').value.trim(), 50, off);
    if (my !== seq || !$('#mu-body')) return;
    $('#mu-body').innerHTML = !res.rows.length ? '<div class="empty">Aucun membre trouvé.</div>' : `<div class="sub">${num(res.total)} membre(s)</div>
      <div class="tbl"><table><thead><tr><th>Pseudo</th><th>E-mail</th><th>Rôle</th><th>Offre</th><th>Pro jusqu'au</th><th>Inscrit le</th><th>Dernière visite</th><th>État</th></tr></thead><tbody>${res.rows.map(u => `
        <tr class="go" tabindex="0" data-user="${esc(u.id)}"><td class="nm">${esc(u.pseudo)}</td><td class="meta">${esc(u.email_masked)}</td><td>${roleBadge(u.role)}</td><td>${planBadge(u)}</td>
        <td>${u.pro_until ? fdate(u.pro_until) : '—'}</td><td>${fdate(u.created_at)}</td><td>${fdate(u.last_seen)}</td><td>${u.banned ? '<span class="pill p-sell">BANNI</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="row">${off ? '<button class="btn" type="button" id="mu-prev">Précédents</button>' : ''}${off + 50 < res.total ? '<button class="btn" type="button" id="mu-next">Suivants</button>' : ''}</div>`;
    $('#mu-prev')?.addEventListener('click', () => { off = Math.max(0, off - 50); load(); });
    $('#mu-next')?.addEventListener('click', () => { off += 50; load(); });
  };
  $('#mu-q').addEventListener('input', debounce(() => { off = 0; load(); }, 300));
  main.addEventListener('click', e => { const tr = e.target.closest('[data-user]'); if (tr) openUser(tr.dataset.user, load); });
  await load();
}

async function modAnnouncements(main) {
  const list = await S.api.allAnnouncements();
  const local = v => v ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  main.innerHTML = `<section class="panel"><h2 id="an-title">Nouvelle annonce</h2>
      <form class="form stack" id="an-form"><input type="hidden" id="an-id">
        <label for="an-t">Titre<input id="an-t" required maxlength="120"></label>
        <label for="an-b">Texte<textarea id="an-b" maxlength="1000"></textarea></label>
        <div class="form"><label for="an-l">Niveau<select id="an-l"><option value="info">Information</option><option value="success">Bonne nouvelle</option><option value="warning">Attention</option><option value="danger">Urgent</option></select></label>
          <label for="an-s">Début (optionnel)<input id="an-s" type="datetime-local"></label><label for="an-e">Fin (optionnelle)<input id="an-e" type="datetime-local"></label>
          <label class="chk"><input id="an-a" type="checkbox" checked> <span>Active</span></label></div>
        <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" id="an-reset">Nouvelle</button></div></form></section>
    <section class="panel"><h2>Annonces</h2>${list.length ? list.map(a => `<div class="row" style="align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:10px">
      <div style="flex:1;min-width:0">${noticeHTML(a, false)}<div class="meta">${a.active ? 'Active' : 'Inactive'}${a.starts_at ? ' · du ' + fdatetime(a.starts_at) : ''}${a.ends_at ? ' au ' + fdatetime(a.ends_at) : ''} · créée le ${fdate(a.created_at)}</div></div>
      <button class="btn small" type="button" data-edit="${esc(a.id)}">Modifier</button><button class="btn small danger" type="button" data-del="${esc(a.id)}">Supprimer</button></div>`).join('') : '<div class="empty">Aucune annonce.</div>'}</section>`;
  const fill = a => { $('#an-id').value = a?.id ?? ''; $('#an-t').value = a?.title || ''; $('#an-b').value = a?.body || ''; $('#an-l').value = a?.level || 'info'; $('#an-s').value = local(a?.starts_at); $('#an-e').value = local(a?.ends_at); $('#an-a').checked = a ? !!a.active : true; $('#an-title').textContent = a ? 'Modifier l\'annonce' : 'Nouvelle annonce'; };
  $('#an-reset').addEventListener('click', () => fill(null));
  $('#an-form').addEventListener('submit', async e => {
    e.preventDefault();
    const iso = v => v ? new Date(v).toISOString() : null;
    try {
      await S.api.saveAnnouncement({ id: $('#an-id').value ? +$('#an-id').value : undefined, title: $('#an-t').value.trim(), body: $('#an-b').value.trim(), level: $('#an-l').value, active: $('#an-a').checked, starts_at: iso($('#an-s').value), ends_at: iso($('#an-e').value) });
      toast('Annonce enregistrée.'); emit('announcements'); modAnnouncements(main);
    } catch (err) { toast(errText(err), 'err'); }
  });
  main.onclick = async e => {
    const b = e.target.closest('[data-edit],[data-del]'); if (!b) return;
    if (b.dataset.edit) { fill(list.find(a => String(a.id) === b.dataset.edit)); $('#an-t').focus(); return; }
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Confirmer'; return; }
    try { await S.api.deleteAnnouncement(+b.dataset.del); toast('Annonce supprimée.'); emit('announcements'); modAnnouncements(main); } catch (err) { toast(errText(err), 'err'); }
  };
}

// Actualités du bandeau : les flux RSS arrivent seuls chaque matin ; ici on ajoute, corrige ou masque une entrée
async function modNews(main) {
  const list = await S.api.allNews();
  const local = v => v ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  const KINDS = [['site', 'Annonce du site'], ['news', 'Actualité'], ['release', 'Sortie d\'extension'], ['event', 'Événement, tournoi']];
  main.innerHTML = `<section class="panel"><h2 id="nw-title">Nouvelle actualité</h2>
      <form class="form stack" id="nw-form"><input type="hidden" id="nw-id">
        <label for="nw-t">Titre (affiché dans le bandeau)<input id="nw-t" required minlength="3" maxlength="300"></label>
        <div class="form"><label for="nw-u">Lien (optionnel)<input id="nw-u" class="w-l" type="url" placeholder="https://…"></label>
          <label for="nw-src">Source<input id="nw-src" class="w-m" maxlength="80" placeholder="Pokémon, PokéBeach…"></label>
          <label for="nw-kd">Type<select id="nw-kd">${KINDS.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label for="nw-lg">Langue<select id="nw-lg"><option>FR</option><option>EN</option><option>JP</option></select></label>
          <label for="nw-d">Date<input id="nw-d" type="datetime-local"></label>
          <label class="chk"><input id="nw-a" type="checkbox" checked> <span>Visible</span></label></div>
        <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" id="nw-reset">Nouvelle</button></div></form></section>
    <section class="panel"><h2>Actualités (${list.length})</h2><p class="sub">Les titres des flux RSS sont relevés par la synchronisation de chaque matin. Décochez « Visible » pour en masquer un.</p>
      ${list.length ? `<div class="tbl"><table><thead><tr><th>Date</th><th>Titre</th><th>Source</th><th>Type</th><th>Visible</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${list.map(n => `<tr>
        <td>${fdate(n.published_at)}</td><td>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)}</td><td>${esc(n.source || '')}</td>
        <td>${esc((KINDS.find(k => k[0] === n.kind) || [, n.kind])[1])}</td><td>${n.active ? 'Oui' : 'Non'}</td>
        <td class="nowrap"><button class="btn small" type="button" data-edit="${esc(n.id)}">Modifier</button><button class="btn small danger" type="button" data-del="${esc(n.id)}">Supprimer</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucune actualité pour l\'instant.</div>'}</section>`;
  const fill = n => { $('#nw-id').value = n?.id ?? ''; $('#nw-t').value = n?.title || ''; $('#nw-u').value = n?.url || ''; $('#nw-src').value = n?.source || ''; $('#nw-kd').value = n?.kind || 'site';
    $('#nw-lg').value = n?.lang || 'FR'; $('#nw-d').value = local(n?.published_at); $('#nw-a').checked = n ? !!n.active : true; $('#nw-title').textContent = n ? 'Modifier l\'actualité' : 'Nouvelle actualité'; };
  $('#nw-reset').addEventListener('click', () => fill(null));
  $('#nw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const d = $('#nw-d').value;
    try {
      await S.api.saveNews({ id: $('#nw-id').value ? +$('#nw-id').value : undefined, title: $('#nw-t').value.trim(), url: $('#nw-u').value.trim() || null, source: $('#nw-src').value.trim() || null,
        kind: $('#nw-kd').value, lang: $('#nw-lg').value, active: $('#nw-a').checked, published_at: d ? new Date(d).toISOString() : undefined });
      toast('Actualité enregistrée.'); emit('news'); modNews(main);
    } catch (err) { toast(errText(err), 'err'); }
  });
  main.onclick = async e => {
    const b = e.target.closest('[data-edit],[data-del]'); if (!b) return;
    if (b.dataset.edit) { fill(list.find(n => String(n.id) === b.dataset.edit)); $('#nw-t').focus(); return; }
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Confirmer'; return; }
    try { await S.api.deleteNews(+b.dataset.del); toast('Actualité supprimée.'); emit('news'); modNews(main); } catch (err) { toast(errText(err), 'err'); }
  };
}

async function modSettings(main) {
  const st = await S.api.settings(), sets = await loadSets();
  let featured = [...(st.featured_sets || [])];
  main.innerHTML = `<section class="panel"><h2>Réglages du site</h2>
      <form class="form stack" id="st-form">
        <div class="form"><label for="st-pm">Prix Pro mensuel affiché (€)<input id="st-pm" class="w-s" type="number" step="0.01" min="0" value="${st.pro_price_month ?? ''}"></label>
          <label for="st-py">Prix Pro annuel affiché (€)<input id="st-py" class="w-s" type="number" step="0.01" min="0" value="${st.pro_price_year ?? ''}"></label>
          <label for="st-tc">Taille de l'aperçu gratuit<input id="st-tc" class="w-xs" type="number" min="0" max="10" value="${st.free_teaser_count ?? 5}"></label>
          <label for="st-fr">Cartes Pro offertes par compte gratuit<input id="st-fr" class="w-xs" type="number" min="0" max="50" value="${st.free_reveals ?? 5}"></label></div>
        <p class="sub">Les prix affichés doivent correspondre aux prix réellement facturés dans Stripe (Produits > Pokédex Trader Pro). Ils servent aussi au calcul du MRR.</p>
        <label class="chk"><input id="st-mm" type="checkbox"${st.maintenance_mode ? ' checked' : ''}> <span>Mode maintenance (bandeau pour tous les visiteurs ; l'équipe n'est pas affectée)</span></label>
        <label for="st-mmsg">Message de maintenance<input id="st-mmsg" maxlength="200" value="${esc(st.maintenance_message || '')}"></label>
        <div><div class="meta">Extensions à la une (catalogue)</div><div class="chips" id="st-feat"></div></div>
        <div class="search"><label for="st-fq">Ajouter une extension à la une<input id="st-fq" class="w-l" placeholder="Nom de l'extension" autocomplete="off"></label><div class="sugg" id="st-fs" hidden></div></div>
        <div><button class="btn primary" type="submit">Enregistrer les réglages</button></div></form></section>`;
  const drawFeat = () => { $('#st-feat').innerHTML = featured.length ? featured.map(id => `<span class="chip"><span>${esc(sets.find(s => s.id === id)?.name || id)}</span><button class="btn small ghost" type="button" data-unfeat="${esc(id)}" aria-label="Retirer">×</button></span>`).join('') : '<span class="sub">Aucune.</span>'; };
  drawFeat();
  $('#st-fq').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase(), box = $('#st-fs');
    if (q.length < 2) { box.hidden = true; return; }
    const hits = sets.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).slice(0, 12);
    box.innerHTML = hits.map(s => `<button type="button" data-feat="${esc(s.id)}">${esc(s.name)} <span class="meta">${esc(s.lang)} · ${(s.release_date || '').slice(0, 4)}</span></button>`).join('') || '<button type="button" disabled>Aucune extension</button>';
    box.hidden = false;
  });
  main.onclick = e => {
    const a = e.target.closest('[data-feat]'), r = e.target.closest('[data-unfeat]');
    if (a && !featured.includes(a.dataset.feat)) { featured.push(a.dataset.feat); $('#st-fs').hidden = true; $('#st-fq').value = ''; drawFeat(); }
    if (r) { featured = featured.filter(x => x !== r.dataset.unfeat); drawFeat(); }
  };
  $('#st-form').addEventListener('submit', async e => {
    e.preventDefault();
    const vals = { pro_price_month: +$('#st-pm').value, pro_price_year: +$('#st-py').value, free_teaser_count: Math.max(0, Math.min(10, +$('#st-tc').value || 0)), free_reveals: Math.max(0, Math.min(50, +$('#st-fr').value || 0)),
      maintenance_mode: $('#st-mm').checked, maintenance_message: $('#st-mmsg').value.trim(), featured_sets: featured };
    try {
      for (const [k, v] of Object.entries(vals)) if (JSON.stringify(v) !== JSON.stringify(st[k])) await S.api.saveSetting(k, v);
      toast('Réglages enregistrés.'); emit('settings'); modSettings(main);
    } catch (err) { toast(errText(err), 'err'); }
  });
}

async function modData(main) {
  const [h, runs] = await Promise.all([S.api.dataHealth(), S.api.syncRuns(15)]);
  const last = runs.find(r => r.status === 'ok' || r.status === 'partial'), ageH = last?.finished_at ? (Date.now() - new Date(last.finished_at)) / 36e5 : null;
  main.innerHTML = `${ageH != null && ageH > 36 ? `<div class="notice l-warning"><div><b>Données anciennes</b><p>Dernière publication réussie il y a ${Math.round(ageH)} h. Vérifiez la synchro quotidienne (python3 -m pokedex_trader publish-site).</p></div></div>` : ''}
    ${kpis([['Cartes', num(h.cards), `${num(h.cards_priced)} avec une cote`], ['Extensions', num(h.sets)], ['Analyses', num(h.analysis), h.analysis_updated ? 'calculées le ' + fdatetime(h.analysis_updated) : ''],
      ['Points d\'historique', num(h.history_rows), h.history_last ? 'dernier le ' + fdate(h.history_last) : ''], ['Dernière cote', fdate(h.last_price_date)],
      ['Langues', Object.entries(h.langs || {}).map(([k, v]) => `${k} ${num(v)}`).join(' · ') || '—']])}
    <section class="panel"><h2>Dernières synchronisations</h2>${runs.length ? `<div class="tbl"><table><thead><tr><th>Début</th><th>Durée</th><th>État</th><th class="n">Cartes</th><th class="n">Analyses</th><th class="n">Historique</th><th>Notes</th></tr></thead><tbody>${runs.map(r => `
      <tr><td>${fdatetime(r.started_at)}</td><td>${r.finished_at ? Math.max(1, Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 6e4)) + ' min' : 'en cours'}</td>
      <td><span class="pill ${r.status === 'ok' ? 'p-buy' : r.status === 'error' ? 'p-sell' : 'p-warn'}">${esc(r.status.toUpperCase())}</span></td>
      <td class="n">${num(r.cards)}</td><td class="n">${num(r.analysis)}</td><td class="n">${num(r.history)}</td><td class="meta">${esc(r.notes || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucune synchronisation enregistrée. Lancez python3 -m pokedex_trader publish-site.</div>'}</section>`;
}

async function modAudit(main) {
  main.innerHTML = `<section class="panel"><form class="form" role="search" onsubmit="return false"><label for="au-q" style="flex:1 1 260px">Filtrer (action, auteur, cible)<input id="au-q" type="search"></label></form><div id="au-body"><div class="sub">Chargement…</div></div></section>`;
  const load = async () => {
    const rows = await S.api.auditLog({ q: $('#au-q').value.trim(), lim: 200 });
    if (!$('#au-body')) return;
    $('#au-body').innerHTML = rows.length ? `<div class="tbl"><table><thead><tr><th>Date</th><th>Auteur</th><th>Action</th><th>Cible</th><th>Détails</th></tr></thead><tbody>${rows.map(a => `
      <tr><td class="nowrap">${fdatetime(a.at)}</td><td>${esc(a.actor_pseudo || 'système')}</td><td>${esc(ACTIONS[a.action] || a.action)}</td>
      <td class="meta">${esc(a.target_type || '')}${a.target_id ? ' · ' + esc(S.api.userPseudo?.(a.target_id) || a.target_id) : ''}</td><td>${a.details ? `<pre class="json">${esc(JSON.stringify(a.details, null, 1))}</pre>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucune action enregistrée.</div>';
  };
  $('#au-q').addEventListener('input', debounce(load, 300));
  await load();
}
