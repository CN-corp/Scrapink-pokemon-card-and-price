// Fiche carte (dialogue). Pour tous, même sans compte : cote, détail du prix et historique de la cote.
// Boutons EN / FR / JP : la même carte dans une autre langue. Sans compte, « Noter un achat ou une vente » mène à l'inscription.
// Compte gratuit : wishlist, alertes de prix, et les stats Pro affichées directement sur les 5 premières cartes ouvertes,
// puis la Poké Ball au cadenas jaune (reveal.js). Pro : analyse, signal, estimations, prix conseillés, calcul de la gradation.
import { $, esc, eur, pc, sg, fdate, errText, store, cssVar, byNumber } from '../util.js';
import { S, hasPro, cacheCards } from '../state.js';
import { openDialog, locked, frame, pill, scoreBar, confBar, langTag, chart, chartBase, isSealed, zoomCard, FLAGS, LANG_NAMES } from '../ui.js';
import { loadRevealStatus, isRevealed, revealsLeft, noteReveal, lockRow, cu } from '../reveal.js';
import { personalSignal } from '../fifo.js';
import { tradeZones, VERDICT_TEXT } from '../advice.js';
import { GRADERS, PROBA, era, ERA_LABEL, gradeSim, VERD, isGraded } from '../grading.js';
import { loadPortfolio } from '../portfolio.js';
import { loadSets, loadSetCards } from './catalog.js';
import { dropTable, rarityOf, rarityLabel, fmtCard } from '../pullrates.js';
import { helpPop, PACK_ICON } from './collections.js';
import { PTYPES } from './produits.js';

// Une cote n'est jamais convertie d'une devise à l'autre ni empruntée à une autre langue : sans cote propre, la fiche le dit
const SOURCE = { EN: 'cote Cardmarket (prix tendance en euros), carte anglaise brute', JP: 'cote Cardmarket (cartes japonaises, en euros), carte brute' };
const NO_PRICE = { FR: 'Cote française pas encore disponible : il n\'existe pas encore de source publique de prix pour les cartes françaises. Nous ne la remplaçons jamais par la cote d\'une autre langue.',
  JP: 'Cote japonaise pas encore disponible en euros. Nous ne convertissons jamais une cote d\'une autre devise.' };

const NAV_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const NAV_NEXT = NAV_PREV.replace('M15 5l-7 7 7 7', 'M9 5l7 7-7 7');
function langSwitch(cur, langs) {
  return `<div class="lang-sw" role="group" aria-label="Langue de la carte"><span class="lbl">Langue</span>${['EN', 'FR', 'JP'].map(k => {
    const to = langs?.[k], here = k === cur, l = LANG_NAMES[k];
    const title = here ? `Version ${l} affichée` : to ? `Voir la version ${l}` : `Pas de version ${l} dans le catalogue`;
    return `<button type="button"${to && !here ? ` data-lang-to="${esc(to)}"` : ''} aria-pressed="${here}"${!here && !to ? ' disabled' : ''} title="${title}" aria-label="${title}">${FLAGS[k]}${k}</button>`;
  }).join('')}</div>`;
}
const ZOOM_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6"/></svg>';

export async function openCard(id) {
  const d = openDialog('Fiche carte', '<div class="sub">Chargement…</div>', { onClose: () => { $('#dlg').onkeydown = null; } });
  const body = d.querySelector('.dlg-body');
  d.dataset.cardOpen = id;
  let c = S.cards.get(id);
  try { if (!c || c.price === undefined) { c = await S.api.card(id); if (c) cacheCards([c]); } } catch (e) { c = null; }
  if (d.dataset.cardOpen !== id) return; // une autre fiche a été ouverte entre-temps
  if (!c) { body.innerHTML = '<div class="empty">Carte introuvable.</div>'; return; }
  $('#dlg-title').textContent = c.name;
  const pro = hasPro(), logged = !!S.user;
  // Données publiques de l'extension (chance de tirage, rang par cote) : chargées en parallèle, facultatives
  const sealed = isSealed(c);
  const setP = Promise.all([loadSets(), c.set_id && !sealed ? loadSetCards(c.set_id) : []]).catch(() => [[], []]);
  // Navigation carte par carte dans la série (ordre des numéros) ; produits : ceux de la même série
  const navP = (sealed ? S.api.products?.({ set_id: c.set_id || '', q: c.set_id ? '' : c.group || '' }).then(r => r.sort((x, y) => y.price - x.price)) : setP.then(([, sc]) => [...sc].sort(byNumber)))
    .then(list => { list = (list || []).filter(x => !sealed || (x.set_id === c.set_id && (c.set_id || x.group === c.group))); if (sealed) cacheCards(list); return list; }).catch(() => []);
  navP.then(list => navBar(d, list, id));
  const langsP = sealed ? Promise.resolve({}) : (S.api.cardLangs?.(id) || Promise.resolve({})).catch(() => ({}));
  let a = null, hist = [], pf = null;
  [a, hist, pf] = await Promise.all([pro ? S.api.analysis(id).catch(() => null) : null, cardHistory(c), logged ? loadPortfolio({ withAnalysis: false }).catch(() => null) : null,
    logged ? loadRevealStatus() : null]);
  // Compte gratuit : stats Pro affichées directement sur les 5 premières cartes ouvertes (une carte déjà vue le
  // reste ; une carte sans analyse ne compte pas), puis la Poké Ball
  let mode = pro ? 'pro' : 'locked';
  if (!pro && logged && (isRevealed(id) || revealsLeft() > 0)) {
    try {
      const r = await S.api.revealCard(id);
      if (r?.analysis) { noteReveal(id, r); a = r.analysis; if (r.history?.length) hist = r.history; }
      mode = 'revealed';
    } catch (e) { /* quota atteint ou erreur : Poké Ball */ }
  }
  const [[sets, setCards], langs] = await Promise.all([setP, langsP]);
  if (!d.open || d.dataset.cardOpen !== id) return;
  const pos = pf?.sum.pos.find(p => p.cid === id), wish = pf?.wish.find(w => w.card_id === id);
  const year = (c.release_date || '').slice(0, 4);
  const cond = pf?.txs.filter(t => t.card_id === id && t.side === 'buy').sort((x, y) => y.date.localeCompare(x.date))[0]?.condition;

  const paint = () => {
    const full = mode !== 'locked';
    const sig = full && a ? personalSignal(a, pos, wish?.target_price) : null;
    const raw = a?.price ?? c.price, z = sig ? tradeZones(sig, !!pos) : null;
    body.innerHTML = `<div class="fiche"><div class="fiche-art">${frame(c, (isGraded(cond) ? `<span class="grade">${esc(cond)}</span>` : '') + (z ? cardStats(sig, z) : ''), true)}
      ${c.image_small || c.image_large ? `<button class="zoom-btn" type="button" id="cs-zoom" aria-label="Zoomer sur ${sealed ? 'le produit' : 'la carte'}">${ZOOM_IC}<span>Zoom</span></button>` : ''}</div>
    <div class="side">
      <div><div class="sub">${sealed ? `<span class="pill p-info">${esc(PTYPES[c.ptype] || 'Produit scellé')}</span> ${esc(c.set_name || '')}${langTag(c.lang)}${year ? ' · ' + year : ''}`
        : `${esc(c.set_name || '')}${langTag(c.lang)} · n° ${esc(c.number || '—')}${c.rarity ? ' · ' + esc(rarityLabel(rarityOf(c))) : ''}${year ? ' · ' + year : ''}`}</div>${sealed ? '' : langSwitch(c.lang || 'EN', langs)}</div>
      <div class="row" style="align-items:baseline"><span class="cote">${eur(raw)}</span>${full ? pill(sig?.signal) : ''}<span class="sub">cote du jour</span></div>
      ${full ? (sig ? zonesHTML(sig, pos) : '') : lockRow()}
      ${sealed ? sealedDetail(c, raw) : priceDetail(c, raw, sets, setCards)}
      ${pos ? `<div class="sub">Dans mon Pokédex : ${pos.q} ex.${pos.value == null ? '' : ` · ${eur(pos.value)} à la cote`}${full ? ` · prix de revient ${eur(pos.avg)} · latent ${pos.value == null ? '—' : sg(pos.value - pos.cost)}` : ''}</div>` : ''}
      <div class="trade-cta" id="cs-actions">${logged ? `<a class="btn primary" href="#/portefeuille?card=${encodeURIComponent(id)}">${PLUS_IC}Ajouter à mon Pokédex</a>${pos?.q ? `<a class="btn sell" href="#/portefeuille?card=${encodeURIComponent(id)}&amp;side=sell">${COIN_IC}Je l'ai vendue</a>` : ''}`
        : `<a class="btn primary" href="#/inscription" title="Créez un compte gratuit pour noter vos achats et ventes">${PLUS_IC}Ajouter à mon Pokédex</a>`}</div>
      ${logged ? `<form class="form" id="cs-wish"><label for="cs-target">Prix cible wishlist (€)<input id="cs-target" class="w-s" type="number" min="0" step="0.01" value="${wish?.target_price ?? ''}" placeholder="optionnel"></label>
        <button class="btn" type="submit">${wish ? 'Mettre à jour ma wishlist' : 'Ajouter à ma wishlist'}</button>${wish ? '<button class="btn ghost danger" type="button" id="cs-unwish">Retirer</button>' : ''}</form>` : ''}
      ${logged ? `<form class="form" id="cs-alert"><label for="cs-dir">Alerte quand la cote passe<select id="cs-dir"><option value="below">sous</option><option value="above">au-dessus de</option></select></label>
        <label for="cs-aprice">Prix (€)<input id="cs-aprice" class="w-s" type="number" min="0.01" step="0.01" required value="${raw ? (raw * 0.9).toFixed(2) : ''}"></label><button class="btn" type="submit">Créer l'alerte</button></form>` : ''}
      <div class="msg" id="cs-msg" role="status"></div>
      ${full ? (a ? `<div class="dgrid rv">${[['Estimé 30 j', cu(a.est30)], ['Fourchette 30 j', a.est30_low ? `${eur(a.est30_low)} – ${eur(a.est30_high)}` : '—'], ['Estimé 90 j', cu(a.est90)], ['Gain net 30 j', pc(a.exp_return30_net)],
          ['7 j', pc(a.mom7)], ['30 j', pc(a.mom30)], ['90 j', pc(a.mom90)], ['Tendance 1 an', pc(a.trend_year ?? a.mom365)], ['Plus haut 1 an', cu(a.ath_365)],
          ['Score achat', scoreBar(sig.buy_score)], ['Score vente', scoreBar(sig.sell_score)], ['Confiance', confBar(a.confidence)]]
          .map(([l, v], i) => `<div style="--i:${i}"><div class="meta">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
        ${sig.reasons_buy?.length ? `<p class="rv"><b class="up">Pour l'achat :</b> ${sig.reasons_buy.map(esc).join(' · ')}</p>` : ''}
        ${sig.reasons_sell?.length ? `<p class="rv"><b class="down">Pour la vente :</b> ${sig.reasons_sell.map(esc).join(' · ')}</p>` : ''}`
        : '<div class="empty">Pas encore d\'analyse pour cette carte (cote trop basse ou historique insuffisant).</div>') : ''}
      <section class="hist" aria-labelledby="hs-title"><h3 id="hs-title">Historique de la cote</h3>
        <div class="chart s"><canvas id="dlg-card-chart" aria-label="Historique de la cote"></canvas></div><div class="sub" id="cs-hist"></div></section>
    </div></div>
    ${raw && !sealed ? (pro ? gradingPanel(id, raw, year) : `<div class="gr">${locked({ title: 'Calcul de la gradation', small: true,
      text: 'PSA, PCA ou CCC : le gain espéré après tous les frais pour cette carte. Inclus dans l\'abonnement Pro.' })}</div>`) : ''}`;
    bind(raw);
  };

  const bind = raw => {
    const msg = (t, ok = true) => { const m = $('#cs-msg'); if (m) { m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'err'); } };
    $('#cs-wish')?.addEventListener('submit', async e => {
      e.preventDefault();
      const v = $('#cs-target').value;
      try { await S.api.upsertWish({ card_id: id, target_price: v === '' ? null : +v }); msg('Wishlist mise à jour.'); }
      catch (err) { msg(errText(err), false); }
    });
    $('#cs-unwish')?.addEventListener('click', async () => { try { await S.api.deleteWish(id); msg('Retirée de la wishlist.'); } catch (err) { msg(errText(err), false); } });
    $('#cs-alert')?.addEventListener('submit', async e => {
      e.preventDefault();
      try { await S.api.addAlert({ card_id: id, direction: $('#cs-dir').value, price: +$('#cs-aprice').value }); msg('Alerte créée. Retrouvez-la dans Wishlist et alertes.'); }
      catch (err) { msg(errText(err), false); }
    });
    if (pro && raw && !sealed) bindGrading(id, raw, year);
    body.querySelectorAll('[data-lang-to]').forEach(b => b.addEventListener('click', () => openCard(b.dataset.langTo)));
    $('#cs-zoom')?.addEventListener('click', e => zoomCard(c, e.currentTarget.closest('.fiche-art').querySelector('.frame')));
    body.querySelector('.fiche-art .frame')?.addEventListener('click', e => zoomCard(c, e.currentTarget));
    // Historique de la cote : public (lisible sans compte, comme la cote)
    if (!hist?.length) { body.querySelector('.hist .chart')?.remove(); const h = $('#cs-hist'); if (h) h.textContent = 'Historique pas encore disponible pour cette carte.'; return; }
    chart('dlg-card-chart', { type: 'line', data: { labels: hist.map(x => x[0]), datasets: [{ label: 'Cote (€)', data: hist.map(x => x[1]), borderColor: cssVar('--accent'), borderWidth: 2,
      pointRadius: hist.length < 30 ? 3 : 0, fill: { target: 'origin', above: cssVar('--surface-2') } }] }, options: chartBase({ plugins: { legend: { display: false } } }) });
    $('#cs-hist').textContent = `${hist.length} relevés, du ${fdate(hist[0][0])} au ${fdate(hist[hist.length - 1][0])}.`;
  };

  body.onclick = async e => {
    if (e.target.closest('a[href^="#/"]')) d.close(); // lien interne (dont la Poké Ball) : on ferme la fiche
  };
  paint();
}

/** Flèches « précédente / suivante » dans l'en-tête de la fiche, flèches du clavier et glissement du doigt */
function navBar(d, list, id) {
  const i = list.findIndex(x => x.id === id);
  if (!d.open || d.dataset.cardOpen !== id || i < 0 || list.length < 2) return;
  const prev = list[i - 1], next = list[i + 1], head = d.querySelector('.dlg-head');
  if (!head || head.querySelector('.dlg-nav')) return;
  const what = isSealed(list[i]) ? 'produit' : 'carte';
  head.querySelector('[data-close]').insertAdjacentHTML('beforebegin', `<div class="dlg-nav" role="group" aria-label="Parcourir la série">
    <button class="icon-btn" type="button" data-nav="${esc(prev?.id || '')}"${prev ? '' : ' disabled'} aria-label="${what === 'carte' ? 'Carte précédente' : 'Produit précédent'}${prev ? ' : ' + esc(prev.name) : ''}" title="← ${prev ? esc(prev.name) : ''}">${NAV_PREV}</button>
    <span class="dlg-pos">${i + 1} / ${list.length}</span>
    <button class="icon-btn" type="button" data-nav="${esc(next?.id || '')}"${next ? '' : ' disabled'} aria-label="${what === 'carte' ? 'Carte suivante' : 'Produit suivant'}${next ? ' : ' + esc(next.name) : ''}" title="${next ? esc(next.name) : ''} →">${NAV_NEXT}</button></div>`);
  const go = to => { if (!to) return; openCard(to.id); d.classList.add(to === next ? 'nav-r' : 'nav-l'); };
  head.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => go(b.dataset.nav === next?.id ? next : prev)));
  d.onkeydown = e => {
    if (e.target.closest('input,select,textarea') || document.querySelector('.zoom-ov')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(next); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(prev); }
  };
  let x0 = null;
  const art = d.querySelector('.fiche-art');
  art?.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  art?.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) go(dx < 0 ? next : prev); });
}

/** Détail du prix d'un produit scellé (public) : cote, offre la moins chère, type, série */
function sealedDetail(c, raw) {
  const rows = [
    ['Cote actuelle', `${eur(raw)}${c.price_date ? `, relevée le ${fdate(c.price_date)}` : ''}`],
    ['Source', 'cote non disponible pour les produits scellés'],
    ['Type de produit', esc(PTYPES[c.ptype] || 'Produit scellé')],
    ['Offre la moins chère', c.low != null ? `${eur(c.low)}${raw ? ` <span class="meta">(${pc(c.low / raw - 1)} par rapport à la cote)</span>` : ''}` : '—'],
    ['Nom du produit', esc(c.name_en || c.name)],
  ];
  return `<section class="pdetail" aria-labelledby="pd-title"><h3 id="pd-title">Détail du prix</h3>
    <dl class="pd-grid">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${c.set_id ? `<a class="sub" href="#/collections/${encodeURIComponent(c.set_id)}">Voir les cartes et les produits de ${esc(c.set_name || 'la série')} →</a>` : '<a class="sub" href="#/produits">Tous les produits scellés →</a>'}</section>`;
}

const PLUS_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const COIN_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 8.5a4 4 0 1 0 0 7M7.5 11h6M7.5 13.5h6" stroke-linecap="round"/></svg>';

/** Historique public de la cote de la carte (le sien uniquement) */
async function cardHistory(c) {
  return (await S.api.history(c.id).catch(() => [])) || [];
}

/** Les stats Pro posées sur l'illustration : signal, prix d'achat et objectif de revente */
function cardStats(sig, z) {
  return `<div class="card-stats" aria-hidden="true"><span class="cs-scan"></span>
    <span class="cs-chip cs-sig" style="--i:0">${esc(sig.signal || '')}</span>
    <span class="cs-chip cs-buy" style="--i:1"><small>Acheter sous</small>${cu(z.buyBelow)}</span>
    <span class="cs-chip cs-sell" style="--i:2"><small>Vendre dès</small>${cu(z.sellAbove)}</span></div>`;
}

/** Prix d'achat conseillé, objectif de revente et verdict du jour (Pro) */
function zonesHTML(sig, pos) {
  const z = tradeZones(sig, !!pos); if (!z) return '';
  const [cls, txt] = VERDICT_TEXT[z.verdict];
  const gap = v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)} % par rapport à la cote`;
  const mine = pos ? (pos.avg ? `<p class="sub">Votre prix de revient : ${eur(pos.avg)}. Vendre vos ${pos.q} ex. à ${eur(z.sellAbove)} vous rapporterait ${sg((z.sellNet - pos.avg) * pos.q)} après frais.</p>` : '') : '';
  return `<section class="zones rv" aria-labelledby="zn-title"><h3 id="zn-title">Quand acheter, quand vendre</h3>
    <div class="verdict ${cls}">${esc(txt)}</div>
    <div class="zgrid"><div class="z-buy"><span class="meta">Acheter sous</span><b>${cu(z.buyBelow)}</b><span class="meta">${gap(z.gapBuy)}</span></div>
      <div class="z-sell"><span class="meta">Vendre au-dessus de</span><b>${cu(z.sellAbove)}</b><span class="meta">soit ${eur(z.sellNet)} encaissés après frais</span></div></div>
    ${mine}<p class="meta">Calculé chaque matin à partir de la fourchette estimée à 30 jours, de la volatilité et des scores d'achat et de vente. Indicateur statistique, pas un conseil financier.</p></section>`;
}

/** Détail du prix (public, pour tous) : cote, date, source, chance de tirage estimée, rang dans l'extension,
 *  puis invitation vers le Marché (pour un non-Pro, la page Marché affiche l'offre Pro). Aucune donnée Pro ici. */
function priceDetail(c, raw, sets, setCards) {
  const set = sets.find(s => s.id === c.set_id) || { id: c.set_id, name: c.set_name, lang: c.lang, release_date: c.release_date };
  const list = setCards.some(x => x.id === c.id) ? setCards : [...setCards, c];
  const t = setCards.length ? dropTable(set, list).byId.get(c.id) : null;
  const ranked = list.filter(x => x.price != null).sort((x, y) => y.price - x.price);
  const rk = c.price == null ? 0 : ranked.findIndex(x => x.id === c.id) + 1;
  const r = rarityOf(c);
  const rows = [
    ['Cote actuelle', raw == null ? `<span class="meta">${esc(NO_PRICE[c.lang] || 'Cote pas encore disponible pour cette carte.')}</span>` : `${eur(raw)}${c.price_date ? `, relevée le ${fdate(c.price_date)}` : ''}`],
    ...(raw == null ? [] : [['Source', esc(SOURCE[c.lang] || 'cote Cardmarket, carte brute')]]),
    ['Rareté', t ? `<span class="rbadge inline lv${t.level}">${esc(t.label)}</span>` : esc(rarityLabel(r))],
    [`Chance de tirage ${helpPop()}`, t ? `${PACK_ICON}${esc(fmtCard(t))}${t.kind === 'pack' ? ' <span class="meta">estimation</span>' : ''}` : '—'],
    ['Rang dans l\'extension', rk ? (rk === 1 ? `la plus chère des ${ranked.length} cartes cotées` : `${rk}<sup>e</sup> plus chère sur ${ranked.length}`) : '—'],
  ];
  return `<section class="pdetail" aria-labelledby="pd-title"><h3 id="pd-title">Détail du prix</h3>
    <dl class="pd-grid">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${c.set_id ? `<a class="sub" href="#/collections/${encodeURIComponent(c.set_id)}">Voir toute la collection ${esc(c.set_name || '')}, de la plus rare à la plus commune →</a>` : ''}</section>`;
}

const observed = () => store.get('pt-graded', {}) || {};
function gradingPanel(cid, raw, year) {
  const pr = PROBA[era(year)];
  return `<div class="gr"><div class="head"><h2>Gradation</h2>
      <div class="form"><label for="f-who">Société<select id="f-who">${Object.entries(GRADERS).map(([k, g]) => `<option value="${k}"${k === 'PCA' ? ' selected' : ''}>${g.label}</option>`).join('')}</select></label>
      <label for="f-p10">Chance de note 10 : <b id="f-p10v">${pr[10]} %</b><input id="f-p10" type="range" min="0" max="100" step="5" value="${pr[10]}"></label>
      <label for="f-p9">Chance de note 9 : <b id="f-p9v">${pr[9]} %</b><input id="f-p9" type="range" min="0" max="100" step="5" value="${pr[9]}"></label></div></div>
    <div id="gr-out"></div>
    <div class="form"><label for="f-o10">Prix constaté note 10 (€)<input id="f-o10" class="w-m" type="number" step="0.01" min="0"></label>
      <label for="f-o9">Prix constaté note 9 (€)<input id="f-o9" class="w-m" type="number" step="0.01" min="0"></label>
      <button class="btn" type="button" id="f-osave">Utiliser ces prix</button><span class="msg" id="f-omsg"></span></div>
    <div class="sub">Sans prix constaté, la valeur gradée est estimée à partir de la cote brute et de l'époque de la carte (${ERA_LABEL[era(year)]}). Les ventes récentes de cartes gradées sont la meilleure référence. Frais d'envoi réglables dans Mon espace > Gradation.</div></div>`;
}
function bindGrading(cid, raw, year) {
  const upd = () => {
    const who = $('#f-who').value; let p10 = +$('#f-p10').value, p9 = +$('#f-p9').value;
    if (p10 + p9 > 100) { p9 = 100 - p10; $('#f-p9').value = p9; }
    $('#f-p10v').textContent = p10 + ' %'; $('#f-p9v').textContent = p9 + ' %';
    const obs = observed()[cid] || {};
    $('#f-o10').placeholder = obs[`${who} 10`] ?? ''; $('#f-o9').placeholder = obs[`${who} 9`] ?? '';
    const r = gradeSim(raw, year, who, p10, p9, obs);
    if (r.unavailable) { $('#gr-out').innerHTML = '<div class="verdict v-mid">Cette valeur dépasse les grilles publiques de cette société : demandez un devis.</div>'; return; }
    const [cls, txt] = VERD[r.verdict];
    $('#gr-out').innerHTML = `<div class="verdict ${cls}">${txt} · gain espéré ${r.gain >= 0 ? '+' : ''}${eur(r.gain)}</div>
      <div class="grid-2"><table class="ledger"><tbody>${r.rows.map(x => `<tr><td>Note ${String(x.g).replace('.', ',')} <span class="meta">(${Math.round(x.p * 100)} %)</span></td><td class="n">${eur(x.v)}${x.obs ? ' <span class="meta">constaté</span>' : ''}</td></tr>`).join('')}
        <tr class="tot"><td>Valeur gradée moyenne</td><td class="n">${eur(r.declared)}</td></tr></tbody></table>
      <table class="ledger"><tbody><tr><td>Gradation ${GRADERS[who].label} ${r.fee.tier}</td><td class="n">${eur(r.fee.eur)}</td></tr>
        <tr><td>Port aller-retour (part par carte)</td><td class="n">${eur(r.ship)}</td></tr><tr><td>Assurance</td><td class="n">${eur(r.ins)}</td></tr>
        <tr class="tot"><td>Coût de gradation</td><td class="n">${eur(r.cost)}</td></tr>
        <tr><td>Revente gradée, nette de frais</td><td class="n">${eur(r.ev)}</td></tr><tr><td>Revente brute, nette de frais</td><td class="n">${eur(r.rawNet)}</td></tr></tbody></table></div>`;
  };
  ['#f-who', '#f-p10', '#f-p9'].forEach(s => $(s).addEventListener('input', upd));
  $('#f-osave').addEventListener('click', () => {
    const who = $('#f-who').value, all = observed(), b = { ...(all[cid] || {}) };
    const o10 = parseFloat($('#f-o10').value), o9 = parseFloat($('#f-o9').value);
    if (o10 > 0) b[`${who} 10`] = o10; if (o9 > 0) b[`${who} 9`] = o9;
    all[cid] = b; store.set('pt-graded', all);
    $('#f-omsg').textContent = 'Prix gradés enregistrés sur cet appareil.'; $('#f-o10').value = ''; $('#f-o9').value = ''; upd();
  });
  upd();
}
