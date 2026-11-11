// Connexion, inscription, mot de passe oublié (Supabase Auth : e-mail + mot de passe, ou lien magique).
import { $, errText, toast } from '../util.js';
import { S } from '../state.js';

const demoNote = () => S.api.mode === 'demo' ? '<div class="notice"><div><b>Mode démo</b><p>Aucun e-mail n\'est envoyé. N\'importe quelle adresse vous connecte au compte de démonstration (une adresse contenant « pro » ou « mod » ouvre le compte Pro ou Modérateur). La barre en bas de l\'écran permet aussi de changer de profil.</p></div></div>' : '';

function authCard(title, inner) {
  return `<section class="panel" style="max-width:460px;width:100%;margin:10px auto">${inner.replace('%TITLE%', `<h1 style="font-size:26px">${title}</h1>`)}</section>`;
}

export function renderLogin(el, params) {
  const tab = params.get('mode') === 'lien' ? 'link' : 'pw';
  el.innerHTML = authCard('Connexion', `%TITLE%${demoNote()}
    <div class="seg" role="tablist" aria-label="Méthode de connexion">
      <button type="button" role="tab" id="t-pw" aria-selected="${tab === 'pw'}" aria-controls="f-pw">Mot de passe</button>
      <button type="button" role="tab" id="t-link" aria-selected="${tab === 'link'}" aria-controls="f-link">Lien par e-mail</button></div>
    <form class="form stack" id="f-pw" role="tabpanel" aria-labelledby="t-pw"${tab === 'pw' ? '' : ' hidden'}>
      <label for="l-email">Adresse e-mail<input id="l-email" type="email" autocomplete="email" required></label>
      <label for="l-pw">Mot de passe<input id="l-pw" type="password" autocomplete="current-password" required minlength="6"></label>
      <button class="btn primary" type="submit">Se connecter</button>
      <div class="row"><a href="#/mot-de-passe">Mot de passe oublié ?</a><span class="spacer"></span><a href="#/inscription">Créer un compte</a></div>
    </form>
    <form class="form stack" id="f-link" role="tabpanel" aria-labelledby="t-link"${tab === 'link' ? '' : ' hidden'}>
      <p class="sub">Recevez un lien de connexion à usage unique, sans mot de passe.</p>
      <label for="m-email">Adresse e-mail<input id="m-email" type="email" autocomplete="email" required></label>
      <button class="btn primary" type="submit">Recevoir le lien</button>
    </form>
    <div class="msg" id="a-msg" role="alert"></div>`);
  const setTab = t => { $('#t-pw').setAttribute('aria-selected', t === 'pw'); $('#t-link').setAttribute('aria-selected', t === 'link'); $('#f-pw').hidden = t !== 'pw'; $('#f-link').hidden = t !== 'link'; };
  $('#t-pw').addEventListener('click', () => setTab('pw'));
  $('#t-link').addEventListener('click', () => setTab('link'));
  const msg = (t, ok) => { const m = $('#a-msg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'err'); };
  $('#f-pw').addEventListener('submit', async e => {
    e.preventDefault();
    const b = e.submitter; if (b) b.disabled = true;
    try { await S.api.signIn({ email: $('#l-email').value.trim(), password: $('#l-pw').value }); toast('Bienvenue !'); location.hash = params.get('next') || '#/espace'; }
    catch (err) { msg(errText(err)); }
    if (b) b.disabled = false;
  });
  $('#f-link').addEventListener('submit', async e => {
    e.preventDefault();
    const b = e.submitter; if (b) b.disabled = true;
    try { await S.api.magicLink($('#m-email').value.trim()); msg('Si un compte existe avec cette adresse, un lien de connexion vient de vous être envoyé. Pensez à vérifier les indésirables.', true); }
    catch (err) { msg(errText(err)); }
    if (b) b.disabled = false;
  });
}

export function renderSignup(el) {
  el.innerHTML = authCard('Créer un compte', `%TITLE%<p class="sub">Gratuit, sans carte bancaire : votre Pokédex (achats et ventes), vos master sets, votre wishlist et les alertes de prix. Cadeau de bienvenue : les stats Pro de 5 cartes de votre choix, à débloquer d'un clic sur la Poké Ball.</p>${demoNote()}
    <form class="form stack" id="f-up">
      <label for="u-pseudo">Pseudo (affiché sur votre vitrine si vous la partagez, jamais votre e-mail)<input id="u-pseudo" required minlength="2" maxlength="32" autocomplete="nickname"></label>
      <label for="u-email">Adresse e-mail<input id="u-email" type="email" autocomplete="email" required></label>
      <label for="u-pw">Mot de passe (8 caractères minimum)<input id="u-pw" type="password" autocomplete="new-password" required minlength="8"></label>
      <label class="chk"><input id="u-cgu" type="checkbox" required> <span>J'accepte les <a href="#/cgv" target="_blank" rel="noopener">conditions générales</a> et la <a href="#/confidentialite" target="_blank" rel="noopener">politique de confidentialité</a>.</span></label>
      <button class="btn primary" type="submit">Créer mon compte</button>
      <div class="row"><span class="sub">Déjà inscrit ?</span><a href="#/connexion">Se connecter</a></div>
    </form><div class="msg" id="a-msg" role="alert"></div>`);
  $('#f-up').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('#a-msg'), b = e.submitter; if (b) b.disabled = true;
    try {
      const r = await S.api.signUp({ pseudo: $('#u-pseudo').value.trim(), email: $('#u-email').value.trim(), password: $('#u-pw').value });
      if (r.needsConfirm) { m.className = 'msg ok'; m.textContent = 'Compte créé ! Cliquez sur le lien reçu par e-mail pour l\'activer, puis connectez-vous.'; }
      else { toast('Compte créé, bienvenue !'); location.hash = '#/espace'; }
    } catch (err) { m.className = 'msg err'; m.textContent = errText(err); }
    if (b) b.disabled = false;
  });
}

export function renderPassword(el, params) {
  const setNew = params.get('nouveau') === '1' || (S.user && params.get('changer') === '1');
  el.innerHTML = authCard(setNew ? 'Nouveau mot de passe' : 'Mot de passe oublié', setNew ? `%TITLE%
    <form class="form stack" id="f-new">
      <label for="n-pw">Nouveau mot de passe<input id="n-pw" type="password" autocomplete="new-password" required minlength="8"></label>
      <label for="n-pw2">Confirmez<input id="n-pw2" type="password" autocomplete="new-password" required minlength="8"></label>
      <button class="btn primary" type="submit">Enregistrer</button></form><div class="msg" id="a-msg" role="alert"></div>` : `%TITLE%${demoNote()}
    <p class="sub">Indiquez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
    <form class="form stack" id="f-reset"><label for="r-email">Adresse e-mail<input id="r-email" type="email" autocomplete="email" required></label>
      <button class="btn primary" type="submit">Envoyer le lien</button><a href="#/connexion">Retour à la connexion</a></form><div class="msg" id="a-msg" role="alert"></div>`);
  const m = $('#a-msg');
  $('#f-reset')?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await S.api.resetPassword($('#r-email').value.trim()); m.className = 'msg ok'; m.textContent = 'Si un compte existe avec cette adresse, un lien vient d\'être envoyé. Ouvrez-le dans ce même navigateur.'; }
    catch (err) { m.className = 'msg err'; m.textContent = errText(err); }
  });
  $('#f-new')?.addEventListener('submit', async e => {
    e.preventDefault();
    if ($('#n-pw').value !== $('#n-pw2').value) { m.className = 'msg err'; m.textContent = 'Les deux mots de passe sont différents.'; return; }
    try { await S.api.updatePassword($('#n-pw').value); toast('Mot de passe modifié.'); location.hash = '#/espace'; }
    catch (err) { m.className = 'msg err'; m.textContent = errText(err); }
  });
}
