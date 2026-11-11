// Accueil public : d'abord le plaisir de collectionner (ciel coloré, collections, cartes stars, fonctions gratuites),
// ensuite seulement Pro (opportunités du jour, fonctions Pro, tarifs), puis la FAQ.
import { $, esc, eur, fdate, num, ICONS } from '../util.js';
import { S, tier, setting, hasPro } from '../state.js';
import { langTag, frame, thumb, LANG_NAMES } from '../ui.js';
import { pokeLock } from '../reveal.js';
import { teaserTiles } from './market.js';
import { CONFIG } from '../../config.js';
import { loadCollections, collectionTile } from './collections.js';
import { dropTable, fmtCard } from '../pullrates.js';
import { storiesBlock } from './histoires.js';

export function prices() {
  const m = +setting('pro_price_month', CONFIG.PRICE_MONTH) || CONFIG.PRICE_MONTH;
  const y = +setting('pro_price_year', CONFIG.PRICE_YEAR) || CONFIG.PRICE_YEAR;
  return { m, y, save: Math.max(0, Math.round((1 - y / (12 * m)) * 100)) };
}

// Trois niveaux : sans compte (cotes et historiques de toutes les cartes, hausses et baisses de la semaine), compte gratuit
// (collection, alertes), Pro (suivi d'investissement, gradation, indicateurs d'achat et de vente). Le gratuit est montré en premier.
const FREE_FEATURES = [
  ['grid', 'c-blue', 'Toutes les cotes, sans compte', 'Chaque extension et chaque carte : sa cote du jour, l\'historique de son prix et sa chance en booster.'],
  ['book', 'c-red', 'Votre Pokédex', 'Notez vos achats et vos ventes (date, prix, quantité, état) et voyez ce que valent vos cartes à la cote du jour.'],
  ['star', 'c-gold', 'Master sets', 'Cochez vos cartes extension par extension, variantes comprises : coût pour compléter et cartes manquantes les moins chères.'],
  ['bell', 'c-purple', 'Wishlist et alertes de prix', 'Vos cartes rêvées avec un prix cible, et une alerte dès qu\'une cote passe sous votre prix ou dépasse votre objectif.'],
  ['chart', 'c-green', 'Hausses et baisses', 'Les cartes qui ont le plus monté et le plus baissé cette semaine, visibles dès l\'accueil.'],
  ['pin', 'c-pink', 'Une vitrine à partager', 'Montrez votre collection à vos amis avec un simple lien. Les montants restent privés si vous le souhaitez.'],
];
const PRO_FEATURES = [
  ['chart', 'Votre portefeuille d\'investissement', 'Prix de revient, plus-values réalisées et latentes, performance et valeur jour après jour, rapport chaque mois.'],
  ['star', 'Quand acheter, quand vendre', 'Le prix sous lequel acheter et l\'objectif de revente, pour les cartes EN, JP et FR, et des conseils sur vos propres cartes.'],
  ['search', 'Signaux d\'achat et de vente', 'Un score sur 100 pour chaque carte, chaque matin, avec ses raisons en clair et les estimations à 30 et 90 jours.'],
  ['medal', 'Calcul de la gradation', 'PSA, PCA ou CCC : le gain espéré après frais de gradation, d\'envoi et de revente, carte par carte.'],
  ['grid', 'Marché et classement', 'Les opportunités du jour, les plus fortes hausses et baisses, et le classement achat / vente.'],
];
const FAQ = [
  ['D\'où viennent les prix ?', 'Des cotes publiques Cardmarket en euros, relevées une fois par jour. Chaque marché a sa propre cote : nous ne convertissons jamais un prix d\'une devise à l\'autre et ne donnons jamais à une carte la cote d\'une autre langue.'],
  ['D\'où viennent les chances de tirage des collections ?', 'Ce sont des estimations : The Pokémon Company ne publie pas ses taux. Nous partons des taux moyens relevés par la communauté pour chaque rareté et chaque époque, divisés par le nombre de cartes de cette rareté dans l\'extension. Les promos et cartes de coffrets sont indiquées « Hors booster ».'],
  ['Les signaux sont-ils des conseils financiers ?', 'Non. Ce sont des indicateurs statistiques calculés sur l\'historique des cotes. Le marché des cartes réagit aussi aux rééditions, aux annonces et aux tournois : décidez toujours par vous-même.'],
  ['Que puis-je faire sans payer ?', 'Sans compte : les collections, le catalogue, la cote de chaque carte, son historique et sa chance de tirage. Avec un compte gratuit, en plus : votre Pokédex (achats et ventes, valeur de vos cartes à la cote), les master sets, la wishlist, les alertes de prix et votre vitrine, plus toutes les stats Pro de 5 cartes de votre choix. Pro ajoute le suivi de votre portefeuille comme un investissement (prix de revient, plus-values, performance, rapports mensuels, conseils sur vos cartes), le calcul de la gradation, la photo de profil et les indicateurs d\'achat et de vente : signaux, scores, estimations, prix conseillés, marché et classement.'],
  ['Puis-je résilier à tout moment ?', 'Oui, en un clic depuis Mon abonnement (portail sécurisé Stripe). Vous gardez Pro jusqu\'à la fin de la période payée.'],
  ['Mes données sont-elles privées ?', 'Oui, par défaut. Votre Pokédex, vos master sets et votre wishlist ne sont visibles que par vous : la base de données l\'impose, compte par compte. Si vous activez le partage dans Profil, votre vitrine montre vos cartes et votre performance en pourcentage ; les montants en euros ne s\'affichent que si vous le choisissez.'],
  ['Comment sont traitées les cartes françaises ?', 'Le marché français a ses propres prix, différents de ceux des cartes anglaises. Toutes les cartes françaises sont déjà dans le catalogue ; leur cote s\'affichera dès que nous disposerons d\'une source de prix française fiable. D\'ici là, la fiche indique « cote pas encore disponible ».'],
];

export function pricingHTML(interval = 'month') {
  const { m, y, save } = prices();
  const t = tier(), pro = hasPro();
  const freeItems = [['Sans compte : cotes et historique des prix de toutes les cartes', 1], ['Pokédex : vos achats, vos ventes, la valeur de vos cartes', 1], ['Master sets et wishlist', 1], ['Alertes de prix', 1],
    ['Vitrine à partager avec vos amis', 1], ['Plus-values et suivi d\'investissement', 0], ['Calcul de la gradation', 0], ['Signaux, scores et estimations', 0]];
  const proItems = ['Tout le gratuit', 'Portefeuille : prix de revient, plus-values réalisées et latentes (FIFO)', 'Performance et valeur de votre portefeuille dans le temps', 'Rapports mensuels', 'Conseils d\'achat et de vente personnalisés sur vos cartes', 'Calcul de la gradation (PSA, PCA, CCC) : gain espéré après tous les frais', 'Photo de profil (JPG, PNG ou GIF)',
    'Signaux et scores d\'achat / vente sur chaque carte, estimations 30 / 90 j', 'Quand acheter, quand vendre : prix conseillés pour chaque carte EN, JP, FR', 'Marché : opportunités et mouvements de la semaine', 'Classement achat / vente avec indice de confiance', 'Signaux sur les cartes des vitrines de la communauté'];
  const li = (txt, ok = 1) => `<li class="${ok ? '' : 'no'}">${ok ? ICONS.check : ICONS.x}<span>${esc(txt)}</span></li>`;
  return `<div class="row" style="justify-content:center"><div class="seg" role="group" aria-label="Période de facturation">
      <button type="button" data-interval="month" aria-pressed="${interval === 'month'}">Mensuel</button>
      <button type="button" data-interval="year" aria-pressed="${interval === 'year'}">Annuel${save ? ` · −${save} %` : ''}</button></div></div>
    <div class="pricing">
      <div class="plan"><h3>Gratuit</h3><div class="price">0 €<small> pour toujours</small></div><ul>${freeItems.map(([x, ok]) => li(x, ok)).join('')}</ul>
        ${t === 'anon' ? '<a class="btn" href="#/inscription">Créer un compte gratuit</a>' : '<span class="sub">Inclus dans votre compte.</span>'}</div>
      <div class="plan pro"><span class="ribbon">LE PLUS COMPLET</span><h3>Pro</h3>
        <div class="price">${interval === 'year' ? `${num(y, y % 1 ? 2 : 0)} €<small> / an</small>` : `${num(m, 2)} €<small> / mois</small>`}</div>
        <div class="sub">${interval === 'year' ? `soit ${num(y / 12, 2)} € par mois${save ? `, ${save} % d'économie` : ''}` : 'sans engagement, résiliable à tout moment'}</div>
        <ul>${proItems.map(x => li(x)).join('')}</ul>
        ${pro ? '<a class="btn" href="#/abonnement">Gérer mon abonnement</a>' : `<a class="btn gold big" href="#/abonnement?interval=${interval}" data-go-pro>${t === 'anon' ? 'Créer un compte et passer Pro' : 'Passer Pro'}</a>`}</div>
    </div>`;
}
export function bindPricing(el) {
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-interval]'); if (!b) return;
    const box = b.closest('[data-pricing]'); box.innerHTML = pricingHTML(b.dataset.interval);
    box.querySelector(`[data-interval="${b.dataset.interval}"]`)?.focus();
  });
}

// Dernière collection sortie : la grande extension la plus récente et ses versions dans les autres langues,
// avec ses cartes les plus cotées (la cote reste celle de chaque carte, dans son propre marché).
const LANG_ORDER = { FR: 0, EN: 1, JP: 2 };
async function newSet(box, list) {
  if (!box) return;
  const main = list.filter(s => !s.overview_only && (s.cards || 0) >= 60 && s.release_date);
  if (!main.length) return;
  const last = main.reduce((a, s) => s.release_date > a.release_date ? s : a);
  const fam = main.filter(s => s.release_date === last.release_date && seriesOf(s) === seriesOf(last)).sort((a, b) => (LANG_ORDER[a.lang] ?? 9) - (LANG_ORDER[b.lang] ?? 9));
  const lead = fam.find(s => s.lang === S.cardLang) || fam.find(s => s.logo) || fam[0];
  let all = [];
  try { all = await S.api.searchCards({ set_id: lead.id, sort: 'price', limit: 1000 }); } catch (e) { all = []; }
  // Les plus rares d'abord (chance de tirage), puis la plus forte cote dans chaque rareté
  const dt = dropTable(lead, all), rank = new Map(dt.tiers.map((x, i) => [x, i]));
  const cards = all.filter(c => c.image_small || c.image_large)
    .sort((a, b) => rank.get(dt.byId.get(a.id)) - rank.get(dt.byId.get(b.id)) || (b.price ?? -1) - (a.price ?? -1));
  const fan = cards.slice(0, 3), strip = cards.slice(0, 6);
  const total = lead.cards || lead.total || all.length;
  const day = new Date(lead.release_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  box.innerHTML = `
    <div class="ns-txt">
      <span class="ns-eyebrow">${ICONS.star.replace('<svg', '<svg width="14" height="14"')} Dernière collection</span>
      ${lead.logo ? `<img class="ns-logo" src="${esc(lead.logo)}" alt="" decoding="async">` : ''}
      <h2 id="ns-title" class="fancy">${esc(lead.name)}</h2>
      <p class="ns-meta">Sortie le <b>${esc(day)}</b> · ${esc(seriesOf(lead))} · <b>${num(total)}</b> cartes</p>
      <p class="ns-lead">Découvrez toutes ses cartes de la plus rare à la plus commune, leur chance de tirage en booster et la cote de chacune dans sa langue.</p>
      <div class="ns-langs">${fam.map(s => `<a class="ns-lang${s.id === lead.id ? ' on' : ''}" href="#/collections/${encodeURIComponent(s.id)}"><b>${esc(s.lang)}</b><span>${esc(s.name)}</span></a>`).join('')}</div>
      <div class="ctas"><a class="btn gold big" href="#/collections/${encodeURIComponent(lead.id)}">${ICONS.grid} Découvrir la collection</a></div>
    </div>
    <div class="ns-fan" aria-hidden="true">${fan.map((c, i) => `<div class="ns-card n${i}">${frame(c, '', true)}</div>`).join('')}</div>
    ${strip.length ? `<div class="ns-strip"><h3>Ses cartes les plus recherchées</h3><div class="ns-row">${strip.map((c, i) => `<button class="star" type="button" data-card="${esc(c.id)}" style="--i:${i}">${frame(c)}
      <span class="st-nm">${esc(c.name)}${langTag(c.lang)}</span><span class="meta">${esc(dt.byId.get(c.id)?.label || c.rarity || '')} · ${esc(fmtCard(dt.byId.get(c.id), true))}</span>${c.price != null ? `<b class="st-price">${eur(c.price)}</b>` : ''}</button>`).join('')}</div></div>` : ''}`;
  box.hidden = false;
}
const seriesOf = s => (s.series || '').replace(/\s*\(JP\)$/, '');

export async function renderLanding(el, params) {
  const st = S.status, anon = tier() === 'anon';
  el.innerHTML = `
    <section class="sky" aria-labelledby="hero-title">
      <span class="blob b1" aria-hidden="true"></span><span class="blob b2" aria-hidden="true"></span><span class="blob b3" aria-hidden="true"></span>
      <div class="sky-txt">
        <div class="eyebrow">${ICONS.star.replace('<svg', '<svg width="16" height="16"')} Le compagnon des collectionneurs Pokémon</div>
        <h1 id="hero-title">Votre collection Pokémon,<br><span class="rainbow">en grand et en couleurs.</span></h1>
        <p class="lead">Explorez toutes les extensions, anglaises, japonaises et françaises, notez vos achats et vos ventes, et voyez ce que vaut votre classeur à la cote de son propre marché.</p>
        <div class="ctas"><a class="btn gold big" href="#/collections">${ICONS.grid} Explorer les collections</a>
          ${anon ? '<a class="btn big glass" href="#/inscription">Créer un compte gratuit</a>' : '<a class="btn big glass" href="#/espace">Mon espace</a>'}</div>
        <div class="sky-stats">${st?.cards ? `<span><b>${num(st.cards)}</b> cartes suivies</span><span><b>${num(st.sets || 0)}</b> extensions</span><span>cotes du <b>${fdate(st.last_price_date)}</b></span>` : '<span>Cotes mises à jour chaque matin</span>'}</div>
      </div>
      <div class="sky-fan" id="sky-fan" aria-hidden="true"></div>
    </section>

    <section class="col-teaser" aria-labelledby="colt-title">
      <div class="head"><div><h2 id="colt-title" class="fancy">Commencez par les collections</h2><div class="sub">Choisissez une extension : ses cartes de la plus rare à la plus commune, leur chance en booster et leur cote du jour.</div></div>
        <a class="btn primary" href="#/collections">Toutes les collections</a></div>
      <div class="col-strip" id="colt-body"><div class="sub">Chargement…</div></div>
    </section>

    <section aria-labelledby="stars-title" class="stars">
      <div class="head"><div><h2 id="stars-title" class="fancy">Les cartes stars du moment</h2><div class="sub">Les plus fortes cotes du jour. Touchez une carte pour voir sa fiche.</div></div>
        <a class="btn" href="#/catalogue">${ICONS.search} Chercher une carte</a></div>
      <div class="star-grid" id="stars-body"><div class="sub">Chargement…</div></div>
    </section>

    <section class="movers" aria-labelledby="mv-title">
      <div class="head"><div><h2 id="mv-title" class="fancy">Hausses et baisses de la semaine</h2><div class="sub">Les plus fortes variations de cote Cardmarket sur une semaine, parmi les cartes cotées 5 € ou plus. Touchez une carte pour voir sa fiche.</div></div></div>
      <div class="cols" id="mv-body"><div class="sub">Chargement…</div></div>
    </section>

    <div class="section-title"><h2 class="fancy">Gratuit, et déjà très complet</h2><p>Tout ce qu'il faut pour suivre et montrer votre collection, sans payer.</p></div>
    <section class="features">${FREE_FEATURES.map(([ic, col, t, d], i) => `<div class="feature ${col}" style="--i:${i}"><div class="ic">${ICONS[ic]}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}</section>

    <section class="new-set" id="new-set" aria-labelledby="ns-title" hidden></section>

    <a class="zap-cta" id="zap-cta" href="#/catalogue" aria-label="Ouvrir le catalogue de toutes les cartes">
      <span class="zap-flash" aria-hidden="true"></span>
      <span class="zap-txt"><span class="zap-eyebrow">${ICONS.search.replace('<svg', '<svg width="14" height="14"')} Catalogue</span>
        <b>Trouvez n'importe quelle carte en un éclair</b>
        <span class="zap-sub">${st?.cards ? `${num(st.cards)} cartes` : 'Toutes les cartes'} anglaises, françaises et japonaises, avec leur cote et leur historique.</span>
        <span class="zap-bar"><span>Pikachu, Dracaufeu, Mew…</span><span class="zap-go">Chercher ⚡</span></span></span>
      <span class="zap-art" aria-hidden="true"><span class="zap-card" id="zap-card"></span>
        <svg class="zap-bolts" viewBox="0 0 200 200" fill="none" stroke-linejoin="round" stroke-linecap="round">
          <path class="b1" d="M100 4 L82 62 L110 64 L86 122 L118 120 L92 196"/><path class="b2" d="M18 40 L52 74 L38 86 L76 112"/><path class="b3" d="M186 34 L152 70 L168 80 L128 108"/>
          <path class="b4" d="M14 160 L50 140 L44 128 L78 116"/><path class="b5" d="M190 150 L156 134 L162 122 L124 118"/></svg>
        <span class="zap-spark s1"></span><span class="zap-spark s2"></span><span class="zap-spark s3"></span><span class="zap-spark s4"></span></span>
    </a>

    <section class="stories" id="stories" aria-labelledby="st-title"></section>

    <section class="pro-zone" aria-labelledby="pro-title">
      <div class="head"><div><h2 id="pro-title">Pro : investir, savoir quand acheter et quand vendre</h2>
        <div class="sub">${hasPro() ? 'Vous êtes Pro : toutes les stats sont ouvertes.' : "Accès aux statistiques professionnelles pour trader la classe d'actifs."}</div></div>
        <div class="pp-ball big" aria-hidden="true">${pokeLock('float')}</div></div>
      <div id="teaser-body"></div>
      <div class="pro-feats">${PRO_FEATURES.map(([ic, t, d]) => `<div><span class="ic">${ICONS[ic]}</span><b>${t}</b><p>${d}</p></div>`).join('')}</div>
    </section>

    <div class="section-title" id="tarifs"><h2 class="fancy">Tarifs</h2><p>Les cotes sont ouvertes à tous, la collection est gratuite. Passez Pro pour investir avec les signaux.</p></div>
    <section data-pricing>${pricingHTML(params.get('interval') === 'year' ? 'year' : 'month')}</section>

    <div class="section-title"><h2 class="fancy">Questions fréquentes</h2></div>
    <section class="faq">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>

    ${anon ? `<section class="cta-band"><div><h2>Votre collection mérite un vrai suivi.</h2><p>Compte gratuit en 30 secondes, sans carte bancaire.</p></div><a class="btn gold big" href="#/inscription">Je crée mon compte</a></section>` : ''}`;
  bindPricing($('[data-pricing]', el));
  storiesBlock($('#stories', el)).catch(() => $('#stories', el)?.remove());
  // Éclair : la carte Pikachu du Set de Base dans le bouton catalogue ; sur écran tactile, l'éclair part quand le bouton arrive à l'écran
  S.api.cardsByIds(S.cardLang === 'FR' ? ['fr-base1-58', 'base1-58'] : ['base1-58', 'fr-base1-58']).then(cs => { const z = $('#zap-card'); if (z && cs[0]) z.innerHTML = frame(cs[0]); }).catch(() => {});
  const zap = $('#zap-cta');
  if (zap && matchMedia('(hover: none)').matches && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { zap.classList.add('zap'); setTimeout(() => zap.classList.remove('zap'), 1600); } }), { threshold: .6 });
    io.observe(zap);
  }
  if (params.get('section') === 'tarifs') setTimeout(() => $('#tarifs')?.scrollIntoView({ block: 'start' }), 50);

  loadCollections().then(list => {
    const b = $('#colt-body'); if (!b) return;
    const mine = list.filter(s => (s.lang || 'EN') === S.cardLang);
    const feat = (setting('featured_sets', []) || []).map(id => mine.find(s => s.id === id)).filter(Boolean);
    const pick = [...feat, ...mine.filter(s => !feat.includes(s))].slice(0, 6);
    b.innerHTML = pick.length ? pick.map(s => collectionTile(s)).join('') : '<div class="empty">Les collections apparaissent après la première synchronisation.</div>';
    newSet($('#new-set'), list);
  }).catch(() => { const b = $('#colt-body'); if (b) b.innerHTML = '<a href="#/collections">Voir les collections</a>'; });

  // Cartes stars : les plus fortes cotes (illustrées en priorité), en éventail dans le ciel puis en grille
  // Langue sans cote encore relevée : ses cartes les plus récentes, sans prix (jamais la cote d'une autre langue)
  S.api.searchCards({ lang: S.cardLang, sort: 'price', limit: 40 }).then(async list => {
    const priced = list.some(c => c.price != null);
    if (!priced) {
      list = await S.api.searchCards({ lang: S.cardLang, sort: 'date', limit: 40 }).catch(() => list);
      const sub = $('#stars-title')?.nextElementSibling; if (sub) sub.textContent = `Cote ${LANG_NAMES[S.cardLang]} pas encore disponible : voici ses cartes les plus récentes. Touchez une carte pour voir sa fiche.`;
    }
    const withImg = list.filter(c => c.image_small);
    const local = withImg.filter(c => !/^https?:/.test(c.image_small)); // aperçu claude.ai : images hébergées sur place d'abord
    const pick = [...local, ...withImg.filter(c => !local.includes(c)), ...list.filter(c => !c.image_small)];
    const fan = $('#sky-fan');
    if (fan) fan.innerHTML = pick.slice(0, 5).map((c, i) => `<div class="fan-card f${i}">${frame(c)}</div>`).join('') + '<span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span>';
    const b = $('#stars-body'); if (!b) return;
    const stars = (priced ? [...list].sort((x, y) => (y.price ?? 0) - (x.price ?? 0)) : list).slice(0, 10);
    const order = stars.filter(c => pick.indexOf(c) < 12 && local.includes(c)).concat(stars.filter(c => !(pick.indexOf(c) < 12 && local.includes(c))));
    b.innerHTML = order.slice(0, 8).map((c, i) => `<button class="star" type="button" data-card="${esc(c.id)}" style="--i:${i}">${frame(c)}
      <span class="st-nm">${esc(c.name)}${langTag(c.lang)}</span><span class="meta">${esc(c.set_name || '')}</span>${c.price != null ? `<b class="st-price">${eur(c.price)}</b>` : ''}</button>`).join('');
  }).catch(() => { const b = $('#stars-body'); if (b) b.innerHTML = ''; });

  // Hausses et baisses de la semaine : public, calculé sur l'historique des cotes
  (S.api.weekMovers?.(5, S.cardLang) || Promise.resolve(null)).then(m => {
    const b = $('#mv-body'); if (!b) return;
    if (!m || (!m.up.length && !m.down.length)) { b.closest('.movers')?.remove(); return; }
    const row = r => `<button class="mv" type="button" data-card="${esc(r.card_id)}">${thumb(r)}<span><span class="nm">${esc(r.name)}${langTag(r.lang)}</span>
      <span class="meta">${esc(r.set_name || '')}${r.number ? ' · n° ' + esc(r.number) : ''}</span></span>
      <span class="pr"><b class="${r.pct >= 0 ? 'up' : 'down'}">${r.pct >= 0 ? '+' : '−'}${num(Math.abs(r.pct), 1)} %</b><span class="meta">${r.prev_label ? esc(r.prev_label) + ' ' : ''}${eur(r.prev)} → ${eur(r.price)}</span></span></button>`;
    const col = (title, cls, list) => `<div class="col"><h3><span class="${cls}">${cls === 'up' ? '▲' : '▼'}</span> ${title}</h3>${list.length ? list.map(row).join('') : '<div class="sub">Rien à signaler cette semaine.</div>'}</div>`;
    b.innerHTML = col('Plus fortes hausses', 'up', m.up) + col('Plus fortes baisses', 'down', m.down);
  }).catch(() => $('#mv-body')?.closest('.movers')?.remove());

  let rows = [];
  try { rows = await S.api.teaser(S.cardLang); } catch (e) { rows = []; }
  const body = $('#teaser-body');
  if (body && rows.length) body.innerHTML = teaserTiles(rows);
}
