// Pokédex Trader : point d'entrée du site (aucune étape de construction : modules ES natifs).
import { CONFIG } from './config.js';
import { $, esc, store, toast, errText, ICONS } from './js/util.js';
import { S, on, hasPro, isMod, isProPlan, setting, setCardLang } from './js/state.js';
import { installImageFallback, noticeHTML, destroyAllCharts, forbidden, avatar, cardLangMenu, LANG_NAMES } from './js/ui.js';
import { runIntro } from './js/intro.js';
import { resetReveals } from './js/reveal.js';
import { createDemoBackend } from './js/backend-demo.js';
import { createSupabaseBackend } from './js/backend-supabase.js';
import { renderLanding } from './js/views/landing.js';
import { renderCatalog } from './js/views/catalog.js';
import { renderCollections, renderCollection } from './js/views/collections.js';
import { renderLogin, renderSignup, renderPassword } from './js/views/auth.js';
import { renderLegal } from './js/views/legal.js';
import { renderMarket, renderRank } from './js/views/market.js';
import { openCard } from './js/views/card.js';
import { renderDashboard } from './js/views/dashboard.js';
import { renderPokedex } from './js/views/pokedex.js';
import { renderPortfolio } from './js/views/portefeuille.js';
import { renderMasterSets, renderMasterSet } from './js/views/mastersets.js';
import { renderWishlist } from './js/views/wishlist.js';
import { renderGrading } from './js/views/gradingview.js';
import { renderReports } from './js/views/reports.js';
import { renderSubscription, renderProfile } from './js/views/account.js';
import { renderModeration } from './js/views/moderation.js';
import { renderCommunity, renderMember } from './js/views/community.js';
import { renderNews, renderTicker } from './js/views/news.js';
import { renderStory } from './js/views/histoires.js';

const ROUTES = {
  '': (el, p) => renderLanding(el, p),
  tarifs: (el, p) => { p.set('section', 'tarifs'); return renderLanding(el, p); },
  collections: (el, p, id) => id ? renderCollection(el, id) : renderCollections(el, p),
  catalogue: renderCatalog,
  carte: (el, p, id) => { renderCatalog(el, p); openCard(id); },
  marche: renderMarket,
  communaute: el => isMod() ? renderCommunity(el) : (el.innerHTML = forbidden()),
  membre: (el, p, slug) => renderMember(el, slug),
  actus: renderNews,
  histoires: (el, p, id) => renderStory(el, p, id),
  classement: renderRank,
  connexion: renderLogin,
  inscription: renderSignup,
  'mot-de-passe': renderPassword,
  'mentions-legales': el => renderLegal(el, 'mentions-legales'),
  cgv: el => renderLegal(el, 'cgv'),
  confidentialite: el => renderLegal(el, 'confidentialite'),
  espace: renderDashboard,
  pokedex: renderPokedex,
  portefeuille: renderPortfolio,
  'master-sets': (el, p, id) => id ? renderMasterSet(el, id) : renderMasterSets(el),
  wishlist: renderWishlist,
  gradation: renderGrading,
  rapports: renderReports,
  abonnement: renderSubscription,
  profil: renderProfile,
  moderation: (el, p, sub) => renderModeration(el, sub || ''),
};
const NAV_ACTIVE = { '': '', tarifs: '', collections: 'collections', communaute: 'communaute', membre: '', actus: '', histoires: '', catalogue: 'catalogue', carte: 'catalogue', marche: 'marche', classement: 'classement', moderation: 'moderation',
  espace: 'espace', portefeuille: 'espace', pokedex: 'espace', 'master-sets': 'espace', wishlist: 'espace', gradation: 'espace', rapports: 'espace', abonnement: 'espace', profil: 'espace' };

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  if (/(^|&)(access_token|error_description|error)=/.test(h)) return { name: 'auth-callback', params: new URLSearchParams(h), arg: null };
  const [path, qs] = h.split('?');
  const [name, ...rest] = path.split('/').map(s => decodeURIComponent(s));
  return { name: name || '', arg: rest.join('/') || null, params: new URLSearchParams(qs || '') };
}

/* ---------- en-tête, pied de page, barre de démo ---------- */
const THEMES = ['auto', 'light', 'dark'];
function themeNow() { return document.documentElement.dataset.theme || 'auto'; }
function setTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  store.set('pt-theme', t);
  try { localStorage.setItem('pt-theme', t); } catch (e) { /* stockage bloqué */ }
  renderHeader();
  route(true);
}
const ball = '<svg class="brand-ball" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff" stroke="currentColor" stroke-width="2.5"/><path d="M2 16a14 14 0 0 1 28 0z" fill="#e3350d" stroke="currentColor" stroke-width="2.5"/><path d="M2 16h28" stroke="currentColor" stroke-width="2.5"/><circle cx="16" cy="16" r="4.5" fill="#fff" stroke="currentColor" stroke-width="2.5"/></svg>';

const BETA_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7.5 15h9"/></svg>';

function renderHeader() {
  const cur = NAV_ACTIVE[parseHash().name] ?? '';
  const lockIc = hasPro() ? '' : ICONS.lock.replace('<svg', '<svg class="nav-lock"');
  const links = [['', 'Accueil'], ['collections', 'Collections'], ['catalogue', 'Catalogue'], ['marche', 'Marché' + lockIc], ['classement', 'Classement' + lockIc]];
  if (S.user) links.push(['espace', 'Mon espace']);
  if (isMod()) links.push(['communaute', 'Communauté'], ['moderation', 'Modération']);
  if (!S.user) links.push(['tarifs', 'Tarifs']);
  const th = themeNow(), p = S.profile;
  $('#site-header').innerHTML = `<div class="wrap bar">
    <a class="brand" href="#/">${ball}<span class="brand-text">Pokédex Trader</span><span class="beta-tag" title="Site en version bêta : il évolue chaque semaine, vos retours sont les bienvenus">${BETA_IC}Bêta</span></a>
    <nav class="main-nav" id="main-nav" aria-label="Navigation principale">${links.map(([k, l]) => `<a href="#/${k}"${k === cur && (k !== '' || !parseHash().name) ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div class="bar-actions">
      ${cardLangMenu()}
      <button class="icon-btn" type="button" id="theme-btn" aria-label="Thème : ${th === 'auto' ? 'automatique' : th === 'light' ? 'clair' : 'sombre'} (changer)" title="Thème">${th === 'dark' ? ICONS.moon : th === 'light' ? ICONS.sun : ICONS.auto}</button>
      ${S.user ? `<a class="user-chip" href="#/profil" title="Mon profil">${avatar(p?.pseudo, p?.avatar_url)}<span class="nm">${esc(p?.pseudo || S.user.email || '')}</span>${isProPlan() ? '<span class="pill p-pro">PRO</span>' : ''}</a>`
        : '<a class="btn small hide-sm" href="#/connexion">Connexion</a><a class="btn small primary xs-short" href="#/inscription"><span class="long">Créer un compte</span><span class="short">S’inscrire</span></a>'}
      <button class="icon-btn menu-btn" type="button" id="menu-btn" aria-expanded="false" aria-controls="main-nav" aria-label="Menu">${ICONS.menu}</button>
    </div></div>`;
  $('#theme-btn').addEventListener('click', () => setTheme(THEMES[(THEMES.indexOf(themeNow()) + 1) % 3]));
  $('#menu-btn').addEventListener('click', e => { const n = $('#main-nav'), open = !n.classList.contains('open'); n.classList.toggle('open', open); e.currentTarget.setAttribute('aria-expanded', open); });
  if (!S.user) $('#main-nav').insertAdjacentHTML('beforeend', '<a href="#/connexion" class="menu-only">Connexion</a>');
  // Petit écran : le bouton de thème passe dans le menu, pour laisser la place au choix de langue des cartes
  $('#main-nav').insertAdjacentHTML('beforeend', `<button type="button" class="theme-mi" id="theme-mi">${th === 'dark' ? ICONS.moon : th === 'light' ? ICONS.sun : ICONS.auto}Thème : ${th === 'auto' ? 'automatique' : th === 'light' ? 'clair' : 'sombre'}</button>`);
  $('#theme-mi').addEventListener('click', () => setTheme(THEMES[(THEMES.indexOf(themeNow()) + 1) % 3]));
}

function renderFooter() {
  $('#site-footer').innerHTML = `<div class="wrap foot">
    <nav aria-label="Liens légaux"><a href="#/mentions-legales">Mentions légales</a><a href="#/cgv">CGV</a><a href="#/confidentialite">Confidentialité</a><a href="#/tarifs">Tarifs</a><a href="mailto:${esc(CONFIG.CONTACT_EMAIL)}">Contact</a></nav>
    <p class="disclaimer">Pokédex Trader est un outil indépendant d'analyse de cotes. Il n'est ni affilié, ni soutenu, ni sponsorisé par Nintendo, The Pokémon Company, Creatures, GAME FREAK, Cardmarket ou TCGplayer. Pokémon et les noms et illustrations des cartes appartiennent à leurs propriétaires respectifs. Les scores, signaux et estimations sont des indicateurs statistiques : ils ne constituent pas un conseil financier ni une garantie de prix.</p>
    <p>© ${new Date().getFullYear()} Pokédex Trader · Version bêta · Données : pokemontcg.io, Cardmarket, TCGdex${S.api?.mode === 'demo' ? ' · <b>mode démo</b> (données d\'exemple)' : ''}</p></div>`;
}

function renderDemoBar() {
  if (S.api.mode !== 'demo') return;
  document.body.classList.add('has-demo');
  let bar = $('#demo-bar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'demo-bar'; bar.className = 'demo-bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Mode démo : changer de profil'); document.body.append(bar); }
  const cur = S.api.demoPersona();
  bar.innerHTML = `<b>Démo</b><span class="demo-note" title="Les cotes affichées sont réelles (Cardmarket, en euros, avec leur date de relevé) et leur historique commence le 22/10/2026. Les comptes, achats et ventes de démonstration sont fictifs.">cotes réelles, comptes fictifs</span><div class="seg">${[['visitor', 'Visiteur'], ['free', 'Gratuit'], ['pro', 'Pro'], ['mod', 'Modérateur']].map(([k, l]) => `<button type="button" data-persona="${k}" aria-pressed="${k === cur}"${k === 'mod' ? ' title="Compte admin de démonstration"' : ''}>${l}</button>`).join('')}</div>
    <button class="reset" type="button" id="demo-reset" title="Réinitialiser les données de démo" aria-label="Réinitialiser les données de démo">↺</button>`;
  bar.onclick = e => {
    const b = e.target.closest('[data-persona]');
    if (b) { S.api.demoSwitch(b.dataset.persona); toast(`Profil de démo : ${b.textContent}`); }
    if (e.target.closest('#demo-reset')) { S.api.demoReset(); toast('Données de démo réinitialisées.'); }
  };
}

function bannersHTML() {
  const out = [];
  if (setting('maintenance_mode', false)) out.push(noticeHTML({ id: 'maint', level: 'warning', title: 'Maintenance', body: setting('maintenance_message', '') + (isMod() ? ' (visible par tous les visiteurs ; vous voyez le site normalement)' : '') }, false));
  const hidden = store.get('pt-ann-hidden', [], 'session') || [];
  for (const a of S.announcements) if (!hidden.includes(a.id)) out.push(noticeHTML(a));
  return out.join('');
}

/* ---------- routeur ---------- */
let routeSeq = 0, lastPath = null;
async function route(silent = false) {
  const { name, params, arg } = parseHash();
  if (name === 'auth-callback') return; // jetons Supabase dans l'adresse : la session s'ouvre, on redirige ensuite
  const fn = ROUTES[name];
  const my = ++routeSeq;
  destroyAllCharts();
  renderHeader();
  const main = $('#main');
  const banners = document.createElement('div');
  banners.className = 'view'; banners.id = 'banners'; banners.innerHTML = bannersHTML();
  const view = document.createElement('div');
  view.className = 'view';
  main.replaceChildren(...(banners.innerHTML ? [banners] : []), view);
  const path = name + '/' + (arg || '');
  if (!silent && lastPath !== null && lastPath !== path) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  lastPath = path;
  document.title = ({ '': 'Pokédex Trader', collections: 'Collections', communaute: 'Communauté', actus: 'Actualités', histoires: 'Histoires de cartes', catalogue: 'Catalogue', marche: 'Marché', classement: 'Classement', espace: 'Mon espace', pokedex: 'Pokédex', 'master-sets': 'Master sets', wishlist: 'Wishlist', moderation: 'Modération', connexion: 'Connexion', inscription: 'Inscription' }[name] || 'Pokédex Trader') + (name ? ' · Pokédex Trader' : '');
  if (!fn) { view.innerHTML = '<div class="panel" style="text-align:center"><h1 style="font-size:26px">Page introuvable</h1><p class="sub">Cette adresse n\'existe pas.</p><div><a class="btn primary" href="#/">Accueil</a></div></div>'; return; }
  try { await fn(view, params, arg); }
  catch (e) { console.error(e); if (my === routeSeq) view.innerHTML = `<div class="panel"><h2>Une erreur est survenue</h2><p class="sub">${esc(errText(e))}</p><div><button class="btn" type="button" onclick="location.reload()">Recharger</button></div></div>`; }
}

async function refreshAuth() {
  resetReveals();
  S.user = S.api.currentUser();
  try { S.profile = S.user ? await S.api.getProfile() : null; } catch (e) { S.profile = null; }
  if (S.user && !store.get('pt-seen-' + S.user.id, null, 'session')) { store.set('pt-seen-' + S.user.id, 1, 'session'); S.api.touch().catch(() => {}); }
  if (S.profile?.banned) toast('Votre compte est suspendu : lecture seule.', 'err');
}
async function refreshPublic() {
  const [st, set, ann] = await Promise.allSettled([S.api.status(), S.api.settings(), S.api.announcements()]);
  S.status = st.value || null; S.settings = set.value || {}; S.announcements = ann.value || [];
}

/* ---------- interactions globales ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-card]');
  if (t) {
    const inner = e.target.closest('a,input,select,textarea,label,button');
    if (!inner || inner === t) { e.preventDefault(); openCard(t.dataset.card); return; }
  }
  // Langue des cartes : choix dans l'en-tête, ou lien « changer de langue » d'une page qui ouvre ce choix
  const cl = e.target.closest('[data-clang]');
  if (cl) { $('#clang')?.removeAttribute('open'); setCardLang(cl.dataset.clang); return; }
  if (e.target.closest('[data-clang-open]')) { const m = $('#clang'); if (m) { m.open = true; window.scrollTo({ top: 0, behavior: 'smooth' }); m.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true }); } return; }
  if (!e.target.closest('#clang')) $('#clang')?.removeAttribute('open');
  const d = e.target.closest('[data-dismiss]');
  if (d) { const h = store.get('pt-ann-hidden', [], 'session') || []; h.push(+d.dataset.dismiss || d.dataset.dismiss); store.set('pt-ann-hidden', h, 'session'); d.closest('.notice')?.remove(); }
  if (e.target.closest('.main-nav a')) { $('#main-nav')?.classList.remove('open'); $('#menu-btn')?.setAttribute('aria-expanded', 'false'); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#clang')?.open) { const m = $('#clang'); m.open = false; m.querySelector('summary').focus(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('tr.go[data-card]')) { e.preventDefault(); openCard(e.target.dataset.card); }
});

async function boot() {
  installImageFallback();
  const intro = runIntro();
  const live = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && !CONFIG.FORCE_DEMO;
  try { S.api = live ? await createSupabaseBackend() : await createDemoBackend(); }
  catch (e) {
    console.error(e);
    $('#main').innerHTML = `<div class="panel"><h2>Connexion au service impossible</h2><p class="sub">${esc(errText(e))}</p><p class="sub">Vérifiez votre connexion internet, ou les réglages de assets/config.js.</p></div>`;
    return;
  }
  await Promise.all([refreshPublic(), refreshAuth()]);
  renderFooter(); renderDemoBar(); renderTicker();
  S.api.onAuth(async event => {
    await refreshAuth(); renderDemoBar();
    if (event === 'PASSWORD_RECOVERY') { location.hash = '#/mot-de-passe?nouveau=1'; return; }
    if (parseHash().name === 'auth-callback' || (event === 'SIGNED_IN' && ['connexion', 'inscription'].includes(parseHash().name))) { location.hash = '#/espace'; return; }
    route(true);
  });
  on('profile', async () => { await refreshAuth(); route(true); });
  on('settings', async () => { await refreshPublic(); route(true); });
  on('announcements', async () => { S.announcements = await S.api.announcements().catch(() => []); });
  on('news', () => renderTicker());
  on('cardLang', l => { route(true); toast(`Cartes ${LANG_NAMES[l]}s, à la cote de leur marché`); });
  window.addEventListener('hashchange', () => route());
  if (live && S.api.isRecovery?.() && S.user) location.hash = '#/mot-de-passe?nouveau=1';
  else if (parseHash().name === 'auth-callback') setTimeout(() => { if (parseHash().name === 'auth-callback') location.hash = S.user ? '#/espace' : '#/connexion'; }, 2500);
  await route(true);
  await intro;
}
boot();
