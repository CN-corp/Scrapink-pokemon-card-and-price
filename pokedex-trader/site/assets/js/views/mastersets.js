// Master sets : suivi de collection par extension, mode « base » (une carte = une case) ou
// « master » (chaque variante : normale, holo, reverse, 1re édition), coût pour compléter, exports.
import { $, esc, eur, num, norm, toast, errText, download, toCSV, byNumber, debounce, ICONS } from '../util.js';
import { S, cacheCards } from '../state.js';
import { ring, needLogin, LANGS, frame } from '../ui.js';
import { loadSets } from './catalog.js';
import { espaceNav } from './subnav.js';

const VLABEL = { normal: ['N', 'Normale'], holo: ['H', 'Holo'], reverse: ['R', 'Reverse'], first: ['1', '1re édition'] };
const MSF = { q: '', series: '', lang: '', year: '', filter: 'all', rarity: '', mq: '' };
export const variantsOf = c => (c.variants?.length ? c.variants : ['normal']);

async function setCardsOf(id) {
  if (!S.setCards[id]) S.setCards[id] = cacheCards(await S.api.setCards(id));
  return S.setCards[id];
}
const ownedMap = rows => { const m = new Map(); for (const o of rows) m.set(`${o.card_id}|${o.variant}`, o.qty); return m; };

export function completion(cards, om, mode) {
  let have = 0, total = 0, value = 0, missingCost = 0;
  const missing = [];
  for (const c of cards) {
    const vs = variantsOf(c), price = c.price ?? 0;
    if (mode === 'master') {
      for (const v of vs) {
        total++;
        const q = om.get(`${c.id}|${v}`) || 0;
        if (q) { have++; value += q * price; } else { missingCost += price; missing.push({ c, v }); }
      }
    } else {
      total++;
      const q = vs.reduce((a, v) => a + (om.get(`${c.id}|${v}`) || 0), 0) + (vs.includes('normal') ? 0 : (om.get(`${c.id}|normal`) || 0));
      if (q) { have++; value += q * price; } else { missingCost += price; missing.push({ c, v: vs[0] }); }
    }
  }
  return { have, total, value, missingCost, missing };
}

export async function renderMasterSets(el) {
  if (!S.user) { el.innerHTML = needLogin('vos master sets'); return; }
  MSF.lang = S.cardLang; // extensions proposées : d'abord celles de la langue des cartes choisie (vos extensions suivies restent toutes affichées)
  el.innerHTML = `${espaceNav('master-sets')}
    <div class="page-title"><div><h1>Master sets</h1><p class="sub">Suivez vos extensions et voyez ce qu'il vous reste à compléter.</p></div></div>
    <section class="panel"><div class="head"><h2>Accès rapide</h2><span class="sub">Épinglez une extension pour la retrouver ici.</span></div><div class="chips" id="ms-pins"><span class="sub">Chargement…</span></div></section>
    <section class="panel"><h2>Mes extensions suivies</h2><div id="ms-mine"><div class="sub">Chargement…</div></div></section>
    <section class="panel"><h2>Ajouter une extension</h2>
      <form class="form" id="ms-pick" role="search" onsubmit="return false">
        <label for="ms-q" style="flex:1 1 220px">Rechercher<input id="ms-q" type="search" placeholder="151, Célébrations, Évolutions prismatiques…" value="${esc(MSF.q)}"></label>
        <label for="ms-series">Série<select id="ms-series" class="w-m"><option value="">Toutes</option></select></label>
        <label for="ms-lang">Langue<select id="ms-lang"><option value="">Toutes</option>${Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${MSF.lang === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label for="ms-year">Année<select id="ms-year"><option value="">Toutes</option></select></label>
      </form><div id="ms-results"></div></section>`;
  const [sets, follows, owned] = await Promise.all([loadSets(), S.api.masterSets(), S.api.owned()]);
  const byId = new Map(sets.map(s => [s.id, s]));
  const om = ownedMap(owned);
  let mine = follows;

  const series = [...new Set(sets.map(s => s.series).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const years = [...new Set(sets.map(s => (s.release_date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  $('#ms-series').innerHTML += series.map(s => `<option${MSF.series === s ? ' selected' : ''}>${esc(s)}</option>`).join('');
  $('#ms-year').innerHTML += years.map(y => `<option${MSF.year === y ? ' selected' : ''}>${y}</option>`).join('');

  const drawMine = async () => {
    const list = mine.map(f => ({ f, s: byId.get(f.set_id) })).filter(x => x.s);
    const comps = {};
    await Promise.all(list.map(async ({ f }) => { try { comps[f.set_id] = completion(await setCardsOf(f.set_id), om, f.variant_mode); } catch (e) { /* extension illisible */ } }));
    const pins = list.filter(x => x.f.pinned);
    $('#ms-pins').innerHTML = pins.length ? pins.map(({ f, s }) => { const k = comps[f.set_id] || { have: 0, total: s.total || 0 };
      return `<a class="chip" href="#/master-sets/${encodeURIComponent(s.id)}" title="${esc(s.name)} : ${k.have} / ${k.total}">${ring(k.have, k.total, 30, false)}<span>${esc(s.name)}${s.lang !== 'EN' ? ' · ' + esc(s.lang) : ''}</span><span class="meta">${k.have}/${k.total}</span></a>`; }).join('')
      : '<span class="sub">Aucune extension épinglée.</span>';
    $('#ms-mine').innerHTML = list.length ? `<div class="set-list">${list.map(({ f, s }) => { const k = comps[f.set_id] || { have: 0, total: 0, missingCost: 0 };
      return `<div class="set-card">${ring(k.have, k.total, 64)}<div style="min-width:0"><div class="t">${esc(s.name)}</div>
        <div class="meta">${esc(s.series || '')} · ${(s.release_date || '').slice(0, 4)} · ${esc(s.lang)} · mode ${f.variant_mode === 'master' ? 'master' : 'base'}</div>
        <div class="meta">${k.have} / ${k.total} · reste ${eur(k.missingCost)}</div></div>
        <div class="acts"><a class="btn small primary" href="#/master-sets/${encodeURIComponent(s.id)}">Ouvrir</a>
        <button class="btn small" type="button" data-pin="${esc(s.id)}" aria-pressed="${!!f.pinned}">${ICONS.pin}${f.pinned ? 'Désépingler' : 'Épingler'}</button>
        <button class="btn small ghost danger" type="button" data-unfollow="${esc(s.id)}">Ne plus suivre</button></div></div>`; }).join('')}</div>`
      : '<div class="empty">Vous ne suivez encore aucune extension. Cherchez-en une ci-dessous et cliquez « Suivre ».</div>';
  };
  const drawResults = () => {
    Object.assign(MSF, { q: $('#ms-q').value.trim(), series: $('#ms-series').value, lang: $('#ms-lang').value, year: $('#ms-year').value });
    const words = norm(MSF.q).split(/\s+/).filter(Boolean), followed = new Set(mine.map(f => f.set_id));
    const res = sets.filter(s => (!MSF.series || s.series === MSF.series) && (!MSF.lang || s.lang === MSF.lang) && (!MSF.year || (s.release_date || '').startsWith(MSF.year))
      && words.every(w => norm(`${s.name} ${s.id} ${s.series}`).includes(w)));
    $('#ms-results').innerHTML = !res.length ? '<div class="empty">Aucune extension ne correspond.</div>' :
      `<div class="sub">${res.length} extension(s)${res.length > 60 ? ', 60 premières affichées' : ''}</div><div class="set-list">${res.slice(0, 60).map(s => `<div class="set-card">
        ${s.logo ? `<img class="set-logo" src="${esc(s.logo)}" alt="" loading="lazy">` : `<span class="set-logo" aria-hidden="true"></span>`}
        <div style="min-width:0"><div class="t">${esc(s.name)}</div><div class="meta">${esc(s.series || '')} · ${(s.release_date || '').slice(0, 4)} · ${esc(s.lang)} · ${num(s.total)} cartes</div></div>
        <div class="acts">${followed.has(s.id) ? '<span class="pill p-buy">SUIVIE</span>' : `<button class="btn small primary" type="button" data-follow="${esc(s.id)}">Suivre</button>`}
        <a class="btn small" href="#/master-sets/${encodeURIComponent(s.id)}">Voir</a></div></div>`).join('')}</div>`;
  };
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-pin],[data-unfollow],[data-follow]'); if (!t) return;
    t.disabled = true;
    try {
      if (t.dataset.follow) { await S.api.followSet(t.dataset.follow, { pinned: mine.length < 6 }); toast('Extension ajoutée à vos master sets.'); }
      else if (t.dataset.pin) { const f = mine.find(x => x.set_id === t.dataset.pin); await S.api.updateMasterSet(f.set_id, { pinned: !f.pinned }); }
      else if (t.dataset.unfollow) {
        if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Confirmer'; t.disabled = false; return; }
        await S.api.unfollowSet(t.dataset.unfollow); toast('Extension retirée (vos cartes cochées sont conservées).');
      }
      mine = await S.api.masterSets(); await drawMine(); drawResults();
    } catch (err) { toast(errText(err), 'err'); t.disabled = false; }
  });
  $('#ms-pick').addEventListener('input', debounce(drawResults, 200));
  drawResults();
  await drawMine();
}

export async function renderMasterSet(el, setId) {
  if (!S.user) { el.innerHTML = needLogin('vos master sets'); return; }
  el.innerHTML = `${espaceNav('master-sets')}<div class="sub">Chargement de l'extension…</div>`;
  const [sets, follows, owned, cards] = await Promise.all([loadSets(), S.api.masterSets(), S.api.owned(), setCardsOf(setId)]);
  const s = sets.find(x => x.id === setId);
  if (!s) { el.innerHTML = `${espaceNav('master-sets')}<div class="empty">Extension introuvable. <a href="#/master-sets">Retour aux master sets</a></div>`; return; }
  let follow = follows.find(f => f.set_id === setId);
  const om = ownedMap(owned);
  let mode = follow?.variant_mode || 'base';
  const rarities = [...new Set(cards.map(c => c.rarity).filter(Boolean))].sort();
  cards.sort(byNumber);

  el.innerHTML = `${espaceNav('master-sets')}
    <section class="panel"><div class="set-head"><div id="ms-ring"></div><div style="display:grid;gap:8px;min-width:0">
      <div><a href="#/master-sets" class="sub">← Master sets</a><h1 style="font-size:clamp(22px,4vw,30px)">${esc(s.name)}</h1>
      <div class="sub">${esc(s.series || '')} · ${(s.release_date || '').slice(0, 4)} · ${esc(LANGS[s.lang] || s.lang)} · ${cards.length} cartes</div></div>
      <div class="row"><div class="seg" role="group" aria-label="Mode de complétion"><button type="button" data-mode="base">Set de base</button><button type="button" data-mode="master">Master set (variantes)</button></div>
        <button class="btn small" type="button" id="ms-follow"></button></div></div></div>
      <div id="ms-kpis"></div></section>
    <div class="grid-2">
      <section class="panel"><h2>Cartes manquantes les moins chères</h2><ul class="cheap" id="ms-cheap"></ul></section>
      <section class="panel"><h2>Exporter</h2><p class="sub">La liste de ce qu'il vous manque, pour vos achats ou un salon.</p>
        <div class="row"><button class="btn" type="button" id="ms-csv">CSV des manquantes</button><button class="btn" type="button" id="ms-print">Checklist imprimable</button></div></section>
    </div>
    <section class="panel"><div class="head"><h2>Cartes</h2><span class="sub">Touchez une carte pour la cocher. Les cartes grisées vous manquent.</span></div>
      <div class="form"><div class="seg" role="group" aria-label="Afficher">${[['all', 'Toutes'], ['missing', 'Manquantes'], ['owned', 'Possédées'], ['doubles', 'Doubles']].map(([k, l]) => `<button type="button" data-filter="${k}">${l}</button>`).join('')}</div>
        <label for="ms-rar">Rareté<select id="ms-rar"><option value="">Toutes</option>${rarities.map(r => `<option${MSF.rarity === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
        <label for="ms-mq">Texte<input id="ms-mq" class="w-m" type="search" placeholder="Nom ou numéro" value="${esc(MSF.mq)}"></label></div>
      <div id="ms-grid" class="cards-grid"></div></section>`;

  const qtyOf = (c, v) => om.get(`${c.id}|${v}`) || 0;
  const totalQty = c => variantsOf(c).reduce((a, v) => a + qtyOf(c, v), 0);
  const isOwned = c => mode === 'master' ? variantsOf(c).every(v => qtyOf(c, v) > 0) : totalQty(c) > 0;
  const isDouble = c => mode === 'master' ? variantsOf(c).some(v => qtyOf(c, v) > 1) : totalQty(c) > 1;
  const drawHead = () => {
    const k = completion(cards, om, mode);
    $('#ms-ring').innerHTML = ring(k.have, k.total, 108);
    el.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    el.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.filter === MSF.filter));
    $('#ms-follow').textContent = !follow ? 'Suivre cette extension' : follow.pinned ? 'Désépingler' : 'Épingler en accès rapide';
    $('#ms-kpis').innerHTML = `<div class="kpis">${[['Complétion', `${k.have} / ${k.total}`], ['Valeur de mes cartes', eur(k.value)], ['Coût pour compléter', eur(k.missingCost)], ['Manquantes', num(k.missing.length)]]
      .map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>`;
    const cheap = k.missing.filter(m => m.c.price != null).sort((a, b) => a.c.price - b.c.price).slice(0, 6);
    $('#ms-cheap').innerHTML = cheap.length ? cheap.map(m => `<li><span><button class="btn small ghost" type="button" data-card="${esc(m.c.id)}">n° ${esc(m.c.number)} ${esc(m.c.name)}</button>${mode === 'master' ? ` <span class="meta">${VLABEL[m.v]?.[1] || m.v}</span>` : ''}</span><span class="nowrap">${eur(m.c.price)}</span></li>`).join('')
      : `<li><span class="sub">${k.missing.length ? 'Pas de cote pour les cartes manquantes.' : 'Extension complète, bravo !'}</span></li>`;
  };
  const tile = c => {
    const own = isOwned(c), tq = totalQty(c), vs = variantsOf(c), pv = vs.find(v => qtyOf(c, v) > 0) || vs[0];
    return `<div class="ms-tile${tq ? '' : ' missing'}" data-id="${esc(c.id)}">
      <button class="hit" type="button" data-toggle="${esc(c.id)}" aria-pressed="${own}" aria-label="${esc(c.name)} n° ${esc(c.number)} : ${own ? 'possédée, toucher pour retirer' : 'manquante, toucher pour cocher'}">
        ${frame(c, tq ? `<span class="own-badge" aria-hidden="true">${ICONS.check}</span>` : '')}</button>
      <div class="t1" title="${esc(c.name)}">${esc(c.name)}</div><div class="t2"><span>n° ${esc(c.number || '')}</span><span>${eur(c.price)}</span></div>
      ${mode === 'master' ? `<div class="vrow" role="group" aria-label="Variantes">${vs.map(v => `<button class="vbtn" type="button" data-var="${v}" data-cid="${esc(c.id)}" aria-pressed="${qtyOf(c, v) > 0}" title="${VLABEL[v]?.[1] || v}">${VLABEL[v]?.[0] || v}${qtyOf(c, v) > 1 ? '×' + qtyOf(c, v) : ''}</button>`).join('')}</div>` : ''}
      ${tq ? `<div class="stepper" role="group" aria-label="Quantité ${esc(VLABEL[pv]?.[1] || pv)}"><button type="button" data-step="-1" data-cid="${esc(c.id)}" data-v="${pv}" aria-label="Retirer un exemplaire">−</button><span>${qtyOf(c, pv)}</span><button type="button" data-step="1" data-cid="${esc(c.id)}" data-v="${pv}" aria-label="Ajouter un exemplaire">+</button></div>` : ''}
      <button class="btn small ghost" type="button" data-card="${esc(c.id)}" style="justify-self:start;padding:2px 4px">Fiche</button></div>`;
  };
  const drawGrid = () => {
    const words = norm(MSF.mq).split(/\s+/).filter(Boolean);
    const list = cards.filter(c => (!MSF.rarity || c.rarity === MSF.rarity) && words.every(w => norm(`${c.name} ${c.number}`).includes(w))
      && (MSF.filter === 'all' || (MSF.filter === 'missing' ? !isOwned(c) : MSF.filter === 'owned' ? totalQty(c) > 0 : isDouble(c))));
    $('#ms-grid').innerHTML = list.length ? list.map(tile).join('') : '<div class="empty" style="grid-column:1/-1">Aucune carte dans ce filtre.</div>';
  };
  const redraw = () => { drawHead(); drawGrid(); };
  const ensureFollow = async () => { if (!follow) { await S.api.followSet(setId, { variant_mode: mode }); follow = { set_id: setId, variant_mode: mode, pinned: false }; } };
  const setQty = async (c, v, q) => {
    const k = `${c.id}|${v}`, prev = om.get(k) || 0;
    q = Math.max(0, Math.min(999, q));
    if (q) om.set(k, q); else om.delete(k);
    const keepFocus = document.activeElement?.dataset?.toggle || null;
    redraw();
    if (keepFocus) el.querySelector(`[data-toggle="${CSS.escape(keepFocus)}"]`)?.focus();
    try { await ensureFollow(); await S.api.setOwned(c.id, v, q); }
    catch (err) { if (prev) om.set(k, prev); else om.delete(k); redraw(); toast(errText(err), 'err'); }
  };
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-toggle],[data-var],[data-step],[data-mode],[data-filter],#ms-follow,#ms-csv,#ms-print');
    if (!b) return;
    const card = id => cards.find(c => c.id === id);
    if (b.dataset.toggle) {
      const c = card(b.dataset.toggle), vs = variantsOf(c);
      if (totalQty(c) > 0 && (mode === 'base' || isOwned(c))) { for (const v of vs) if (qtyOf(c, v)) await setQty(c, v, 0); }
      else if (mode === 'master') { for (const v of vs) if (!qtyOf(c, v)) await setQty(c, v, 1); }
      else await setQty(c, vs[0], 1);
    } else if (b.dataset.var) { const c = card(b.dataset.cid); setQty(c, b.dataset.var, qtyOf(c, b.dataset.var) ? 0 : 1); }
    else if (b.dataset.step) { const c = card(b.dataset.cid); setQty(c, b.dataset.v, qtyOf(c, b.dataset.v) + +b.dataset.step); }
    else if (b.dataset.mode) {
      mode = b.dataset.mode; redraw();
      try { if (follow) await S.api.updateMasterSet(setId, { variant_mode: mode }); else await ensureFollow(); follow.variant_mode = mode; } catch (err) { toast(errText(err), 'err'); }
    } else if (b.dataset.filter) { MSF.filter = b.dataset.filter; redraw(); }
    else if (b.id === 'ms-follow') {
      try { if (!follow) { await ensureFollow(); toast('Extension suivie.'); } else { await S.api.updateMasterSet(setId, { pinned: !follow.pinned }); follow.pinned = !follow.pinned; } drawHead(); }
      catch (err) { toast(errText(err), 'err'); }
    } else if (b.id === 'ms-csv') {
      const k = completion(cards, om, mode);
      download(`manquantes-${setId}.csv`, toCSV([['Numéro', 'Nom', 'Rareté', 'Variante', 'Cote (€)'], ...k.missing.map(m => [m.c.number, m.c.name, m.c.rarity || '', VLABEL[m.v]?.[1] || m.v, m.c.price ?? ''])]), 'text/csv');
    } else if (b.id === 'ms-print') {
      const k = completion(cards, om, mode);
      $('#print-area').innerHTML = `<h1>${esc(s.name)} : checklist</h1><p>${mode === 'master' ? 'Master set (toutes variantes)' : 'Set de base'} · ${k.have} / ${k.total} · reste ${eur(k.missingCost)}</p>
        <table><thead><tr><th>✓</th><th>N°</th><th>Nom</th><th>Rareté</th>${mode === 'master' ? '<th>Variantes</th>' : ''}<th>Cote</th></tr></thead><tbody>${cards.map(c => `<tr><td>${totalQty(c) ? '☑' : '☐'}</td><td>${esc(c.number)}</td><td>${esc(c.name)}</td><td>${esc(c.rarity || '')}</td>
        ${mode === 'master' ? `<td>${variantsOf(c).map(v => `${qtyOf(c, v) ? '☑' : '☐'} ${VLABEL[v]?.[1] || v}`).join('  ')}</td>` : ''}<td>${eur(c.price)}</td></tr>`).join('')}</tbody></table>`;
      try { window.print(); } catch (err) { toast('Impression impossible sur cet affichage.', 'err'); }
    }
  });
  $('#ms-rar').addEventListener('change', e => { MSF.rarity = e.target.value; drawGrid(); });
  $('#ms-mq').addEventListener('input', debounce(e => { MSF.mq = e.target.value.trim(); drawGrid(); }, 200));
  redraw();
}
