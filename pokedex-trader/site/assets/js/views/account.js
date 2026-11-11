// Mon abonnement (Stripe Checkout / portail client) et Profil (pseudo, photo de profil Pro, mot de passe, export, suppression).
import { $, esc, fdate, toast, errText, download, AVATAR_TYPES, AVATAR_MAX } from '../util.js';
import { S, isProPlan, isMod, hasPro, emit } from '../state.js';
import { needLogin, openDialog, closeDialog, avatar, proHint } from '../ui.js';
import { pricingHTML, bindPricing, prices } from './landing.js';
import { espaceNav } from './subnav.js';
import { copyShareLink, shareUrl } from './community.js';

export function renderSubscription(el, params) {
  if (!S.user) {
    el.innerHTML = `<div class="page-title"><div><h1>Passer Pro</h1><p class="sub">Créez d'abord un compte gratuit, puis choisissez votre formule.</p></div></div>
      <section data-pricing>${pricingHTML(params.get('interval') === 'year' ? 'year' : 'month')}</section>
      <div class="row" style="justify-content:center"><a class="btn primary" href="#/inscription">Créer un compte</a><a class="btn" href="#/connexion">J'ai déjà un compte</a></div>`;
    bindPricing($('[data-pricing]', el));
    return;
  }
  const p = S.profile || {}, pro = isProPlan(), { m, y, save } = prices();
  const ok = params.get('checkout') === 'ok';
  el.innerHTML = `${espaceNav('abonnement')}
    ${ok ? '<div class="notice l-success"><div><b>Merci !</b><p>Votre paiement est validé. L\'accès Pro s\'active dans quelques secondes (rechargez la page si besoin).</p></div></div>' : ''}
    <section class="panel"><h2>Mon abonnement</h2>
      ${pro ? `<p><span class="pill p-pro">PRO</span> ${p.pro_interval === 'year' ? 'Formule annuelle' : p.pro_interval === 'month' ? 'Formule mensuelle' : 'Accès offert'}${p.pro_until ? ` · ${p.pro_interval === 'manual' ? 'jusqu\'au' : 'prochaine échéance ou fin le'} ${fdate(p.pro_until)}` : ''}.</p>
        <div class="row">${['month', 'year'].includes(p.pro_interval) ? '<button class="btn primary" type="button" id="sub-portal">Gérer ou résilier (portail Stripe)</button>' : ''}</div>
        <p class="sub">Factures, moyen de paiement, changement de formule et résiliation se font dans le portail sécurisé Stripe.</p>`
      : `<p>${isMod() ? 'Votre rôle de modération inclut l\'accès Pro.' : 'Vous utilisez le compte gratuit.'} Passez Pro pour suivre votre portefeuille comme un investissement (prix de revient, plus-values, performance, rapports mensuels) et voir les indicateurs d'achat et de vente : signaux, estimations, prix conseillés, marché et classement.</p>
        <div class="grid-2"><div class="plan"><h3>Mensuel</h3><div class="price">${String(m).replace('.', ',')} €<small> / mois</small></div><button class="btn gold" type="button" data-checkout="month">Choisir le mensuel</button></div>
          <div class="plan pro"><span class="ribbon">${save ? `−${save} %` : 'ANNUEL'}</span><h3>Annuel</h3><div class="price">${String(y).replace('.', ',')} €<small> / an</small></div><button class="btn gold" type="button" data-checkout="year">Choisir l'annuel</button></div></div>
        <label class="chk"><input type="checkbox" id="sub-waiver"> <span>Je demande l'accès immédiat à Pro et reconnais perdre mon droit de rétractation de 14 jours (art. L221-28 13° du Code de la consommation).</span></label>
        <p class="sub">Paiement sécurisé par Stripe. Sans engagement : résiliable à tout moment, l'accès reste actif jusqu'à la fin de la période payée.</p>`}
      ${p.pro_until && !pro && p.pro_since ? `<p class="sub">Votre dernier abonnement Pro a pris fin le ${fdate(p.pro_until)}.</p>` : ''}
      <div class="msg" id="sub-msg" role="alert"></div></section>`;
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-checkout],#sub-portal'); if (!b) return;
    const msg = $('#sub-msg');
    if (b.dataset.checkout && !$('#sub-waiver').checked) { msg.className = 'msg err'; msg.textContent = 'Cochez la case d\'accès immédiat pour continuer.'; return; }
    b.disabled = true; msg.className = 'msg'; msg.textContent = 'Redirection vers le paiement sécurisé…';
    try {
      if (b.dataset.checkout) {
        const r = await S.api.checkout(b.dataset.checkout);
        if (r?.demo) { toast('Mode démo : paiement simulé, vous êtes Pro.'); emit('profile'); }
      } else {
        const r = await S.api.portal();
        if (r?.demo) {
          const d = openDialog('Portail client (démo)', `<p>En production, ce bouton ouvre le portail Stripe : factures, carte bancaire, changement de formule, résiliation.</p>
            <div class="row"><button class="btn danger" type="button" id="demo-cancel">Simuler une résiliation</button><button class="btn" type="button" data-close2>Fermer</button></div>`, { narrow: true });
          d.querySelector('[data-close2]').addEventListener('click', closeDialog);
          d.querySelector('#demo-cancel').addEventListener('click', async () => { await S.api.demoCancel(); closeDialog(); toast('Abonnement résilié (démo).'); emit('profile'); });
          msg.textContent = '';
        }
      }
    } catch (err) { msg.className = 'msg err'; msg.textContent = errText(err); }
    b.disabled = false;
  });
}

export function renderProfile(el) {
  if (!S.user) { el.innerHTML = needLogin('votre profil'); return; }
  const p = S.profile || {};
  el.innerHTML = `${espaceNav('profil')}
    <section class="panel"><h2>Profil</h2>
      <form class="form" id="pf-form"><label for="pf-pseudo">Pseudo (visible sur votre vitrine)<input id="pf-pseudo" class="w-l" required minlength="2" maxlength="32" value="${esc(p.pseudo || '')}"></label><button class="btn primary" type="submit">Enregistrer</button></form>
      <p class="sub">E-mail : ${esc(S.user.email || '')} · inscrit le ${fdate(p.created_at)}${p.role && p.role !== 'user' ? ` · rôle ${esc(p.role)}` : ''}</p>
      <div class="msg" id="pf-msg" role="status"></div></section>
    <section class="panel" id="pf-photo"><h2>Photo de profil</h2>
      <div class="avatar-edit"><span id="pf-av">${avatar(p.pseudo, p.avatar_url, 'xl')}</span>
        ${hasPro() ? `<div><p class="sub">JPG, PNG ou GIF (animé compris), 2 Mo au plus. Elle s'affiche en haut du site et sur votre vitrine.</p>
          <div class="row"><label class="btn primary" for="pf-file">Choisir une photo</label><input id="pf-file" type="file" accept="${AVATAR_TYPES.join(',')}" hidden>
          ${p.avatar_url ? '<button class="btn ghost danger" type="button" id="pf-avdel">Retirer la photo</button>' : ''}</div></div>`
          : `<div><p class="sub">Sans photo, votre initiale s'affiche.</p>${proHint('Ajoutez votre photo de profil (JPG, PNG ou GIF)')}</div>`}</div>
      <div class="msg" id="pf-avmsg" role="status"></div></section>
    <section class="panel" id="pf-share"><h2>Partage de mon portefeuille</h2>
      <p class="sub">Votre vitrine publique montre vos cartes et votre performance à ceux à qui vous envoyez le lien. Rien n'est partagé tant que vous ne l'activez pas.</p>
      <label class="chk"><input type="checkbox" id="pf-sh"${p.share_portfolio ? ' checked' : ''}> <span>Partager mon portefeuille (cartes détenues et performance en %)</span></label>
      <label class="chk"><input type="checkbox" id="pf-sha"${p.share_amounts ? ' checked' : ''}${p.share_portfolio ? '' : ' disabled'}> <span>Afficher aussi les montants en euros (valeur, résultat)</span></label>
      ${p.share_portfolio && p.share_slug ? `<div class="row"><input class="w-l" readonly value="${esc(shareUrl(p.share_slug))}" aria-label="Lien de ma vitrine"><button class="btn" type="button" id="pf-copy">Copier le lien</button><a class="btn" href="#/membre/${encodeURIComponent(p.share_slug)}">Voir ma vitrine</a></div>` : ''}
      <div class="msg" id="pf-smsg" role="status"></div></section>
    <section class="panel"><h2>Sécurité</h2><div class="row"><a class="btn" href="#/mot-de-passe?changer=1">Changer mon mot de passe</a><button class="btn" type="button" id="pf-out">Me déconnecter</button></div></section>
    <section class="panel"><h2>Mes données</h2><p class="sub">Téléchargez tout ce que vous avez saisi (format JSON), ou supprimez définitivement votre compte et toutes ses données.</p>
      <div class="row"><button class="btn" type="button" id="pf-export">Exporter mes données</button><button class="btn danger" type="button" id="pf-delete">Supprimer mon compte</button></div></section>`;
  const msg = (t, ok = true) => { const m = $('#pf-msg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'err'); };
  $('#pf-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await S.api.updatePseudo($('#pf-pseudo').value.trim()); msg('Pseudo enregistré.'); emit('profile'); } catch (err) { msg(errText(err), false); }
  });
  const avMsg = (t, ok = true) => { const m = $('#pf-avmsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'err'); };
  $('#pf-file')?.addEventListener('change', async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!AVATAR_TYPES.includes(f.type)) { avMsg('Format accepté : JPG, PNG ou GIF.', false); return; }
    if (f.size > AVATAR_MAX) { avMsg('Image trop lourde : 2 Mo au plus.', false); return; }
    avMsg('Envoi de la photo…');
    try { await S.api.setAvatar(f); emit('profile'); toast('Photo de profil enregistrée.'); } catch (err) { avMsg(errText(err), false); }
  });
  $('#pf-avdel')?.addEventListener('click', async () => {
    try { await S.api.setAvatar(null); emit('profile'); toast('Photo de profil retirée.'); } catch (err) { avMsg(errText(err), false); }
  });
  $('#pf-share').addEventListener('change', async e => {
    if (!e.target.closest('#pf-sh,#pf-sha')) return;
    const on = $('#pf-sh').checked, m = $('#pf-smsg');
    try {
      await S.api.updateSharing({ share_portfolio: on, share_amounts: on && $('#pf-sha').checked });
      m.className = 'msg ok'; m.textContent = on ? 'Partage enregistré.' : 'Partage coupé : votre vitrine n\'est plus visible.';
      emit('profile');
    } catch (err) { m.className = 'msg err'; m.textContent = errText(err); }
  });
  $('#pf-copy')?.addEventListener('click', () => copyShareLink(p.share_slug));
  $('#pf-out').addEventListener('click', async () => { await S.api.signOut(); location.hash = '#/'; });
  $('#pf-export').addEventListener('click', async () => {
    try { download('pokedex-trader-mes-donnees.json', JSON.stringify(await S.api.exportMyData(), null, 1), 'application/json'); } catch (err) { toast(errText(err), 'err'); }
  });
  $('#pf-delete').addEventListener('click', async e => {
    const b = e.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Confirmer la suppression définitive'; return; }
    try { await S.api.deleteAccount(); toast('Compte supprimé.'); location.hash = '#/'; } catch (err) { toast(errText(err), 'err'); b.dataset.armed = ''; b.textContent = 'Supprimer mon compte'; }
  });
}
