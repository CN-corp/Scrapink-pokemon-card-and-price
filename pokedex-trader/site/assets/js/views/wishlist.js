// Wishlist et alertes de prix : compte gratuit (la base les réserve au propriétaire, comptes suspendus en lecture seule).
import { $, esc, eur, pc, fdatetime, toast, errText } from '../util.js';
import { S, cacheCards } from '../state.js';
import { cardCell, cardPicker, needLogin } from '../ui.js';
import { espaceNav } from './subnav.js';

export const alertHit = (a, price) => price != null && (a.direction === 'above' ? price >= a.price : price <= a.price);

export async function renderWishlist(el) {
  if (!S.user) { el.innerHTML = needLogin('votre wishlist'); return; }
  el.innerHTML = `${espaceNav('wishlist')}
    <section class="panel"><div class="head"><div><h2>Ma wishlist</h2><div class="sub">Les cartes que vous cherchez, avec votre prix cible. Atteint = la cote est à votre prix ou en dessous.</div></div></div>
      <form class="form" id="w-form"><div class="search" style="flex:1 1 260px"><label for="w-q">Carte<input id="w-q" class="w-full" placeholder="Tapez un nom de carte" autocomplete="off"></label><div class="sugg" hidden></div></div>
        <label for="w-target">Prix cible (€)<input id="w-target" class="w-s" type="number" min="0" step="0.01" placeholder="optionnel"></label>
        <button class="btn primary" type="submit">Ajouter</button></form><div class="msg" id="w-msg" role="status"></div>
      <div id="w-body"><div class="sub">Chargement…</div></div></section>
    <section class="panel"><div class="head"><div><h2>Alertes de prix</h2><div class="sub">Prévenu quand une carte passe sous votre prix d'achat ou dépasse votre objectif de vente. Vérifiées à chaque mise à jour quotidienne des cotes.</div></div></div><div id="al-body"></div></section>`;
  let pick = null;
  cardPicker($('#w-q'), $('#w-form .sugg'), c => { pick = c; if (c.price != null && !$('#w-target').value) $('#w-target').value = (c.price * 0.9).toFixed(2); });
  let wish = [], alerts = [], cmap = new Map();
  const load = async () => {
    [wish, alerts] = await Promise.all([S.api.wishlist(), S.api.alerts().catch(() => [])]);
    const ids = [...new Set([...wish.map(w => w.card_id), ...alerts.map(a => a.card_id)])];
    cmap = new Map((ids.length ? cacheCards(await S.api.cardsByIds(ids)) : []).map(c => [c.id, c]));
    draw();
  };
  const draw = () => {
    $('#w-body').innerHTML = !wish.length ? '<div class="empty">Votre wishlist est vide. Ajoutez une carte ci-dessus ou depuis sa fiche.</div>' :
      `<div class="tbl"><table><thead><tr><th>Carte</th><th class="n">Cote</th><th class="n">Prix cible</th><th class="n">Écart</th><th>État</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${wish.map(w => {
        const c = cmap.get(w.card_id) || { id: w.card_id, name: w.card_id }, gap = w.target_price && c.price ? c.price / w.target_price - 1 : null, hit = w.target_price != null && c.price != null && c.price <= w.target_price;
        return `<tr><td><button class="btn ghost" type="button" data-card="${esc(c.id)}" style="padding:0;text-align:left">${cardCell(c)}</button></td><td class="n">${eur(c.price)}</td>
          <td class="n"><input class="w-s" type="number" min="0" step="0.01" value="${w.target_price ?? ''}" data-target="${esc(w.card_id)}" aria-label="Prix cible pour ${esc(c.name)}"></td>
          <td class="n">${gap == null ? '—' : pc(-gap)}</td><td>${hit ? '<span class="pill p-buy">CIBLE ATTEINTE</span>' : w.target_price ? '<span class="pill">EN ATTENTE</span>' : '<span class="sub">sans cible</span>'}</td>
          <td><button class="btn small danger" type="button" data-unwish="${esc(w.card_id)}">Retirer</button></td></tr>`; }).join('')}</tbody></table></div>`;
    $('#al-body').innerHTML = `<form class="form" id="al-form"><div class="search" style="flex:1 1 240px"><label for="al-q">Carte<input id="al-q" class="w-full" placeholder="Tapez un nom de carte" autocomplete="off"></label><div class="sugg" hidden></div></div>
        <label for="al-dir">Quand la cote passe<select id="al-dir"><option value="below">sous</option><option value="above">au-dessus de</option></select></label>
        <label for="al-price">Prix (€)<input id="al-price" class="w-s" type="number" min="0.01" step="0.01" required></label><button class="btn primary" type="submit">Créer l'alerte</button></form>
      ${!alerts.length ? '<div class="empty">Aucune alerte. Créez-en une ici ou depuis la fiche d\'une carte.</div>' :
      `<div class="tbl"><table><thead><tr><th>Carte</th><th>Condition</th><th class="n">Cote</th><th>État</th><th>Active</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${alerts.map(a => {
        const c = cmap.get(a.card_id) || { id: a.card_id, name: a.card_id }, hit = a.triggered_at || alertHit(a, c.price);
        return `<tr><td>${cardCell(c)}</td><td>${a.direction === 'above' ? 'au-dessus de' : 'sous'} ${eur(a.price)}</td><td class="n">${eur(c.price)}</td>
          <td>${hit ? `<span class="pill p-warn">DÉCLENCHÉE</span>${a.triggered_at ? `<div class="meta">${fdatetime(a.triggered_at)}</div>` : ''}` : '<span class="pill">EN VEILLE</span>'}</td>
          <td><label class="chk"><input type="checkbox" data-active="${esc(a.id)}"${a.active ? ' checked' : ''}><span class="sr-only">Alerte active</span></label></td>
          <td><button class="btn small danger" type="button" data-delal="${esc(a.id)}">Supprimer</button></td></tr>`; }).join('')}</tbody></table></div>`}`;
    let apick = null;
    cardPicker($('#al-q'), $('#al-form .sugg'), c => { apick = c; if (c.price != null) $('#al-price').value = (c.price * 0.9).toFixed(2); });
    $('#al-form').addEventListener('submit', async e => {
      e.preventDefault();
      if (!apick || $('#al-q').dataset.cardId !== apick.id) { toast('Choisissez la carte dans la liste.', 'err'); return; }
      try { await S.api.addAlert({ card_id: apick.id, direction: $('#al-dir').value, price: +$('#al-price').value }); toast('Alerte créée.'); load(); } catch (err) { toast(errText(err), 'err'); }
    });
  };
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-unwish],[data-delal]'); if (!b) return;
    try { if (b.dataset.unwish) await S.api.deleteWish(b.dataset.unwish); else await S.api.deleteAlert(b.dataset.delal); load(); } catch (err) { toast(errText(err), 'err'); }
  });
  el.addEventListener('change', async e => {
    const t = e.target;
    try {
      if (t.dataset.target) { await S.api.upsertWish({ card_id: t.dataset.target, target_price: t.value === '' ? null : +t.value }); toast('Prix cible mis à jour.'); load(); }
      else if (t.dataset.active) { await S.api.updateAlert(t.dataset.active, { active: t.checked, triggered_at: null }); load(); }
    } catch (err) { toast(errText(err), 'err'); }
  });
  $('#w-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!pick || $('#w-q').dataset.cardId !== pick.id) { $('#w-msg').textContent = 'Choisissez la carte dans la liste de suggestions.'; $('#w-msg').className = 'msg err'; return; }
    const v = $('#w-target').value;
    try { await S.api.upsertWish({ card_id: pick.id, target_price: v === '' ? null : +v }); $('#w-msg').textContent = `${pick.name} ajoutée à la wishlist.`; $('#w-msg').className = 'msg ok'; pick = null; $('#w-q').value = ''; $('#w-target').value = ''; load(); }
    catch (err) { $('#w-msg').textContent = errText(err); $('#w-msg').className = 'msg err'; }
  });
  try { await load(); } catch (e) { $('#w-body').innerHTML = `<div class="empty">Chargement impossible : ${esc(errText(e))}</div>`; }
}
