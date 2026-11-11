// Composants d'interface partagés (pastilles, tableaux, verrou Pro, anneau de complétion, dialogues…)
import { $, esc, eur, pc, norm, debounce, cssVar, ICONS } from './util.js';
import { S, tier, cacheCards, CARD_LANGS } from './state.js';
import { pokeLock } from './reveal.js';

export const LANGS = { EN: 'Anglais (EN)', JP: 'Japonais (JP)', FR: 'Français (FR)' };
// Drapeaux des langues (dessinés : les émojis drapeaux ne s'affichent pas sous Windows)
export const FLAGS = {
  EN: '<svg class="fl" viewBox="0 0 60 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h60v30H0z" fill="#012169"/><path d="M0 0l60 30M60 0L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30M60 0L0 30" stroke="#C8102E" stroke-width="2"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></svg>',
  FR: '<svg class="fl" viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h1v2H0z" fill="#002395"/><path d="M1 0h1v2H1z" fill="#fff"/><path d="M2 0h1v2H2z" fill="#ED2939"/></svg>',
  JP: '<svg class="fl" viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h3v2H0z" fill="#fff"/><circle cx="1.5" cy="1" r=".6" fill="#BC002D"/></svg>',
};
export const LANG_NAMES = { EN: 'anglaise', FR: 'française', JP: 'japonaise' };
// Marché dont vient la cote des cartes de chaque langue (aucune conversion de devise, aucun emprunt entre langues)
const LANG_MARKET = { FR: 'Cote du marché français', EN: 'Cote Cardmarket, en euros', JP: 'Cote Cardmarket (cartes japonaises), en euros' };

/** Choix de la langue des cartes dans l'en-tête : toutes les cartes du site passent dans cette langue et sur son marché */
export function cardLangMenu() {
  const cur = S.cardLang;
  return `<details class="clang" id="clang"><summary title="Langue des cartes" aria-label="Langue des cartes : ${LANG_NAMES[cur]} (changer)">${FLAGS[cur]}<span class="cl-k">${cur}</span><svg class="cl-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
    <div class="clang-menu" role="group" aria-labelledby="clang-h"><div class="clang-h" id="clang-h">Langue des cartes</div>
    ${CARD_LANGS.map(k => `<button type="button" data-clang="${k}" aria-pressed="${k === cur}">${FLAGS[k]}<span><b>Cartes ${LANG_NAMES[k]}s</b><span class="meta">${LANG_MARKET[k]}</span></span></button>`).join('')}
    <p class="meta">Tout le site passe dans cette langue et sur son marché. Sur la fiche d'une carte, les boutons EN / FR / JP montrent ses autres versions.</p></div></details>`;
}
/** Rappel en tête de liste : la langue des cartes affichées, avec un lien vers le choix de l'en-tête */
export const langNote = () => `<span class="clang-note">${FLAGS[S.cardLang]}Cartes ${LANG_NAMES[S.cardLang]}s · <button type="button" class="linkish" data-clang-open>changer de langue</button></span>`;

export const SIGNALS = ['ACHAT FORT', 'ACHAT', 'NEUTRE', 'SURVEILLER', 'ÉVITER'];

export function pill(s) {
  if (!s) return '<span class="pill">EN ATTENTE</span>';
  const c = /ACHAT|RENFORCER/.test(s) ? 'p-buy' : /VENDRE|ÉVITER/.test(s) ? 'p-sell' : /ALLÉGER/.test(s) ? 'p-warn' : /SURVEILLER/.test(s) ? 'p-info' : '';
  return `<span class="pill ${c}">${esc(s)}</span>`;
}
export const scoreBar = v => v == null ? '—' : `<span class="score" title="Score ${Math.round(v)} sur 100"><i><b style="width:${Math.max(0, Math.min(100, v))}%"></b></i>${Math.round(v)}</span>`;
export const confBar = v => v == null ? '—' : `<span class="score conf" title="Confiance dans l'analyse : ${Math.round(v)} sur 100"><i><b style="width:${Math.max(0, Math.min(100, v))}%"></b></i>${Math.round(v)}</span>`;
export const langTag = l => `<span class="lang" title="${esc(LANGS[l || 'EN'] || l)}">${esc(l || 'EN')}</span>`;
export const proTag = () => '<span class="pill p-pro">PRO</span>';
/** Pastille de membre : sa photo de profil (membres Pro), sinon l'initiale de son pseudo */
export const avatar = (pseudo, url, cls = '') => `<span class="avatar${cls ? ' ' + cls : ''}" aria-hidden="true">${url && /^(https:|data:image\/(jpeg|png|gif);)/.test(url)
  ? `<img src="${esc(url)}" alt="" loading="lazy">` : esc((pseudo || '?').slice(0, 1).toUpperCase())}</span>`;

/** Illustration rangée dans une planche (« /_blob/id#s<case>,<colonnes>,<lignes> ») : style CSS de la case, sinon null */
export const spriteBg = src => {
  const m = /^(\/_blob\/[0-9a-f]+)#s(\d+),(\d+),(\d+)$/.exec(src || '');
  if (!m) return null;
  const [i, cols, rows] = [+m[2], +m[3], +m[4]], x = i % cols, y = Math.floor(i / cols);
  return `background-image:url(${m[1]});background-size:${cols * 100}% ${rows * 100}%;background-position:${cols > 1 ? x / (cols - 1) * 100 : 0}% ${rows > 1 ? y / (rows - 1) * 100 : 0}%`;
};
export const isSealed = c => c?.kind === 'sealed';
export const thumb = c => {
  const sp = spriteBg(c?.image_small), cls = `thumb${isSealed(c) ? ' sealed' : ''}`;
  return sp ? `<span class="${cls} sp" style="${sp}" aria-hidden="true"></span>` : c?.image_small ? `<img class="${cls}" src="${esc(c.image_small)}" alt="" loading="lazy" decoding="async">` : `<span class="${cls}" aria-hidden="true"></span>`;
};
export function frame(c, extra = '', large = false) {
  const src = large ? (c?.image_large || c?.image_small) : (c?.image_small || c?.image_large);
  const sp = spriteBg(src), what = isSealed(c) ? 'du produit' : 'de la carte';
  return `<div class="frame${isSealed(c) ? ' sealed' : ''}">${extra}${sp ? `<span class="sp-img" role="img" aria-label="Illustration ${what} ${esc(c?.name)}" style="${sp}"></span>` : src ? `<img src="${esc(src)}" alt="Illustration ${what} ${esc(c?.name)}" loading="lazy" decoding="async">` : ''}<div class="ph"${src ? ' hidden' : ''}>${esc(c?.name || '')}</div></div>`;
}

/** Zoom sur l'illustration : la carte s'envole de sa place vers le centre de l'écran, s'incline sous le pointeur
 *  avec un reflet holographique ; clic, Échap ou glissement vers le bas pour refermer. */
export function zoomCard(c, from) {
  const src = c?.image_large || c?.image_small; if (!src) return;
  const host = from?.closest('dialog') || document.body;
  const ov = document.createElement('div');
  ov.className = 'zoom-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', `Zoom : ${c.name}`); ov.tabIndex = -1;
  const sp = spriteBg(src);
  ov.innerHTML = `<div class="zoom-card${isSealed(c) ? ' sealed' : ''}">${sp ? `<span class="zoom-img" style="${sp}"></span>` : `<img class="zoom-img" src="${esc(src)}" alt="${esc(c.name)}">`}<span class="zoom-glare"></span></div>
    <p class="zoom-hint">${esc(c.name)} · bougez la souris pour incliner, cliquez pour fermer</p>`;
  host.append(ov);
  const card = ov.querySelector('.zoom-card');
  const r0 = from?.getBoundingClientRect();
  const fit = () => { const ratio = isSealed(c) ? 1 : 88 / 63, w = Math.min(innerWidth * 0.86, (innerHeight * 0.82) / ratio, sp ? 440 : 560); card.style.width = w + 'px'; return w; };
  const w = fit(), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (r0 && r0.width && !reduce) {
    const r1 = card.getBoundingClientRect(), s = r0.width / r1.width;
    card.animate([{ transform: `translate(${r0.left + r0.width / 2 - (r1.left + r1.width / 2)}px, ${r0.top + r0.height / 2 - (r1.top + r1.height / 2)}px) scale(${s})` },
      { transform: 'translate(0,0) scale(1.04) rotateY(-8deg)', offset: .75 }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  requestAnimationFrame(() => ov.classList.add('on'));
  const tilt = e => {
    const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    if (reduce) return;
    card.style.transform = `rotateY(${(x * 22).toFixed(1)}deg) rotateX(${(-y * 22).toFixed(1)}deg)`;
    card.style.setProperty('--gx', `${(x + 0.5) * 100}%`); card.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
  };
  let y0 = null;
  const close = () => {
    removeEventListener('keydown', key, true); removeEventListener('resize', fit);
    ov.classList.remove('on'); card.style.transform = 'scale(.6)';
    setTimeout(() => ov.remove(), 260); from?.focus?.();
  };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  ov.addEventListener('pointermove', tilt);
  ov.addEventListener('pointerleave', () => { card.style.transform = ''; });
  ov.addEventListener('pointerdown', e => { y0 = e.clientY; });
  ov.addEventListener('pointerup', e => { if (y0 == null || Math.abs(e.clientY - y0) < 12 || e.clientY - y0 > 60) close(); y0 = null; });
  addEventListener('keydown', key, true); addEventListener('resize', fit);
  ov.focus();
  return w;
}
export function cardCell(c, extra = '') {
  return `<div class="cell-card">${thumb(c)}<div><div class="nm">${esc(c.name)}${langTag(c.lang)}</div><div class="meta">${[c.set_name, c.number && 'n° ' + c.number, c.rarity].filter(Boolean).map(esc).join(' · ')}${extra}</div></div></div>`;
}

/** Image cassée (domaine bloqué, carte sans illustration) : on montre le nom à la place */
export function installImageFallback() {
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.alt) { const alt = img.dataset.alt; delete img.dataset.alt; if (img.dataset.altClass) img.className = img.dataset.altClass; img.src = alt; return; } // image de secours
    if (img.classList.contains('thumb')) { const s = document.createElement('span'); s.className = 'thumb'; s.setAttribute('aria-hidden', 'true'); img.replaceWith(s); return; }
    const ph = img.parentElement?.querySelector('.ph');
    if (ph) { ph.hidden = false; img.remove(); } else img.style.visibility = 'hidden';
  }, true);
}

/** Encart Pro coloré (sans faux contenu grisé) : la Poké Ball au cadenas jaune, une phrase, un bouton */
export function locked({ title = 'Réservé aux membres Pro', text = '', small = false } = {}) {
  const anon = tier() === 'anon';
  return `<div class="pro-promo${small ? ' small' : ''}"><span class="pp-spark" aria-hidden="true"></span><div class="pp-ball">${pokeLock('float')}</div>
    <div class="pp-body"><span class="pp-eyebrow">Pokédex Trader Pro</span><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
    <div class="row">${anon ? '<a class="btn" href="#/inscription">Créer un compte gratuit</a>' : ''}<a class="btn gold" href="#/abonnement">Découvrir Pro</a></div></div></div>`;
}

/** Invitation Pro discrète dans une page gratuite : mini Poké Ball au cadenas + une phrase, vers l'abonnement */
export const proHint = text => `<a class="pro-hint" href="#/abonnement">${pokeLock()}<span><b>Pro</b> · ${esc(text)}</span></a>`;
/** À la place d'un signal (réservé Pro) dans une vignette ou une ligne de tableau */
export const lockChip = () => `<span class="lock-chip" title="Signal réservé aux membres Pro">${pokeLock()}PRO</span>`;

export function needLogin(what = 'cet espace') {
  return `<div class="panel" style="max-width:560px;margin:20px auto;text-align:center;justify-items:center"><h2>Connectez-vous pour accéder à ${esc(what)}</h2>
    <p class="sub">Le compte gratuit suffit pour votre Pokédex (achats et ventes), vos master sets, votre wishlist et les alertes de prix.</p>
    <div class="row" style="justify-content:center"><a class="btn primary" href="#/connexion">Se connecter</a><a class="btn" href="#/inscription">Créer un compte gratuit</a></div></div>`;
}
export const forbidden = () => `<div class="panel" style="max-width:560px;margin:20px auto;text-align:center"><h2>Accès réservé</h2><p class="sub">Cette page est réservée à l'équipe de modération.</p><div><a class="btn" href="#/">Retour à l'accueil</a></div></div>`;

export function ring(owned, total, size = 60, label = true) {
  const r = 26, C = 2 * Math.PI * r, f = total ? Math.min(1, owned / total) : 0;
  const pct = Math.round(f * 100);
  return `<svg class="ring${f >= 1 ? ' done' : ''}" viewBox="0 0 60 60" width="${size}" height="${size}" role="img" aria-label="${owned} sur ${total} (${pct} %)">
    <circle class="bg" cx="30" cy="30" r="${r}" fill="none" stroke-width="6"/>
    <circle class="fg" cx="30" cy="30" r="${r}" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - f)).toFixed(2)}" transform="rotate(-90 30 30)"/>
    ${label ? `<text x="30" y="31" text-anchor="middle" dominant-baseline="middle" style="font-size:${size < 40 ? 0 : 15}px">${pct}%</text>` : ''}</svg>`;
}

/** Tableau du marché (opportunités / mouvements), colonnes de l'outil privé */
export function marketTable(rows, kind = 'buy') {
  if (!rows.length) return '<div class="empty">Aucune carte ne correspond à ce filtre.</div>';
  return `<div class="tbl"><table><thead><tr><th>Carte</th><th>Signal</th><th class="n">Score</th><th class="n">Cote</th><th class="n">7 j</th><th class="n">30 j</th><th class="n">90 j</th><th class="n">Estimé 30 j</th><th class="n">Gain net 30 j</th><th>Pourquoi</th></tr></thead><tbody>` +
    rows.map(r => `<tr class="go" tabindex="0" data-card="${esc(r.card_id)}"><td>${cardCell(r)}</td>
      <td>${pill(r.signal)}</td><td class="n">${scoreBar(r.buy_score)}</td><td class="n">${eur(r.price)}</td><td class="n">${pc(r.mom7)}</td><td class="n">${pc(r.mom30)}</td><td class="n">${pc(r.mom90)}</td>
      <td class="n">${eur(r.est30)}</td><td class="n">${pc(r.exp_return30_net)}</td><td class="why">${(kind === 'buy' ? r.reasons_buy || [] : [...(r.reasons_buy || []), ...(r.reasons_sell || [])]).slice(0, 3).map(esc).join(' · ')}</td></tr>`).join('') + '</tbody></table></div>';
}

/** Barre de filtres : cote mini / maxi, score mini, signal, texte (la langue est celle choisie dans l'en-tête) */
export function filterBar(p, { min = '', signals = SIGNALS, extra = '' } = {}) {
  return `<div class="form" id="fb-${p}">
    <label for="${p}-min">Cote mini (€)<input id="${p}-min" class="w-s" type="number" min="0" inputmode="decimal" value="${min}"></label>
    <label for="${p}-max">Cote maxi (€)<input id="${p}-max" class="w-s" type="number" min="0" inputmode="decimal" placeholder="aucune"></label>
    <label for="${p}-score">Score mini<input id="${p}-score" class="w-xs" type="number" min="0" max="100" inputmode="numeric" placeholder="0"></label>
    <label for="${p}-signal">Signal<select id="${p}-signal"><option value="">Tous</option>${signals.map(s => `<option>${s}</option>`).join('')}</select></label>
    <label for="${p}-q">Texte<input id="${p}-q" class="w-m" type="search" placeholder="Nom, extension…"></label>${extra}</div>`;
}
export function readFilters(p) {
  const v = id => $(`#${p}-${id}`)?.value?.trim() ?? '';
  return { lang: S.cardLang, min: v('min') === '' ? null : +v('min'), max: v('max') === '' ? null : +v('max'),
    score: v('score') === '' ? null : +v('score'), signal: v('signal'), q: v('q') };
}
export function bindFilters(p, fn) {
  const d = debounce(fn, 300);
  $(`#fb-${p}`)?.addEventListener('input', e => (e.target.type === 'search' || e.target.type === 'number' ? d() : fn()));
}

/** Champ de recherche de carte avec suggestions (catalogue public) */
export function cardPicker(input, box, onPick, opts = {}) {
  let items = [], idx = -1, seq = 0;
  const close = () => { box.hidden = true; idx = -1; input.setAttribute('aria-expanded', 'false'); };
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  box.setAttribute('role', 'listbox'); box.id ||= 'sugg-' + Math.random().toString(36).slice(2); input.setAttribute('aria-controls', box.id);
  const show = () => {
    box.innerHTML = items.length ? items.map((c, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === idx}">${thumb(c)}<span><b>${esc(c.name)}</b>${langTag(c.lang)}<br><span class="meta">${esc(c.set_name || '')} · ${c.number ? 'n° ' + esc(c.number) : esc(c.rarity || 'produit scellé')} · ${eur(c.price)}</span></span></button>`).join('')
      : '<button type="button" disabled>Aucune carte trouvée</button>';
    box.hidden = false; input.setAttribute('aria-expanded', 'true');
  };
  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    const my = ++seq;
    try { items = cacheCards(await S.api.searchCards({ q, limit: 20, ...(opts.filters || {}) })); } catch (e) { items = []; }
    if (my === seq) { idx = -1; show(); }
  }, 220);
  input.addEventListener('input', () => { input.dataset.cardId = ''; run(); });
  input.addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); show(); e.preventDefault(); }
    else if (e.key === 'Enter' && idx >= 0) { pick(items[idx]); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  const label = c => `${c.name} · ${c.set_name || ''}${c.number ? ' n° ' + c.number : ''}`;
  const pick = c => { input.value = label(c); input.dataset.cardId = c.id; close(); onPick(c); };
  box.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) pick(items[+b.dataset.i]); });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) close(); });
  return { set(c) { if (c) { input.value = label(c); input.dataset.cardId = c.id; } } };
}

/** Dialogue modal unique */
export function openDialog(title, html, { narrow = false, onClose } = {}) {
  const d = $('#dlg');
  d.className = narrow ? 'narrow' : '';
  d.innerHTML = `<div class="dlg-head"><h2 id="dlg-title">${esc(title)}</h2><button class="icon-btn" type="button" data-close aria-label="Fermer">${ICONS.x}</button></div><div class="dlg-body">${html}</div>`;
  d.onclose = () => { Object.keys(charts).filter(k => k.startsWith('dlg-')).forEach(destroyChart); onClose?.(); };
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  d.onclick = e => { if (e.target === d) d.close(); };
  if (!d.open) d.showModal();
  return d;
}
export const closeDialog = () => { const d = $('#dlg'); if (d.open) d.close(); };

/** Graphiques Chart.js (chargé en différé depuis cdn.jsdelivr.net) */
const charts = {};
export function destroyChart(id) { charts[id]?.destroy(); delete charts[id]; }
export function chart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) { if (el) el.replaceWith(Object.assign(document.createElement('div'), { className: 'empty', textContent: 'Graphique indisponible (bibliothèque non chargée).' })); return null; }
  destroyChart(id);
  charts[id] = new window.Chart(el, cfg);
  return charts[id];
}
export function chartBase(extra = {}) {
  const grid = cssVar('--line'), mut = cssVar('--muted');
  return { responsive: true, maintainAspectRatio: false, animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
    interaction: { mode: 'index', intersect: false }, elements: { point: { radius: 0 } },
    plugins: { legend: { labels: { color: mut, boxWidth: 12 } } },
    scales: { x: { ticks: { color: mut, maxTicksLimit: 7 }, grid: { color: grid } }, y: { ticks: { color: mut }, grid: { color: grid } } }, ...extra };
}
export function destroyAllCharts() { Object.keys(charts).filter(k => !k.startsWith('dlg-')).forEach(destroyChart); }

export function kpis(list) {
  return `<div class="kpis">${list.map(([l, v, d]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`).join('')}</div>`;
}

export function noticeHTML(a, dismiss = true) {
  return `<div class="notice l-${esc(a.level || 'info')}" role="note" data-ann="${esc(a.id)}"><div><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}</div>${dismiss ? `<button class="icon-btn x" type="button" data-dismiss="${esc(a.id)}" aria-label="Masquer l'annonce">${ICONS.x}</button>` : ''}</div>`;
}

export function matchText(r, q) {
  if (!q) return true;
  const h = norm(`${r.name} ${r.set_name} ${r.number || ''} ${r.card_id || r.id || ''}`);
  return norm(q).split(/\s+/).every(w => h.includes(w));
}
