// Catalogue public : recherche de cartes avec leur cote (aucune analyse ici, c'est gratuit).
import { $, esc, eur, fdate, debounce } from '../util.js';
import { S, setting, cacheCards } from '../state.js';
import { cardCell, langNote, LANG_NAMES } from '../ui.js';

const CAT = { q: '', set_id: '', min: '', max: '', sort: 'price' };

export async function loadSets() {
  if (!S.sets) { try { S.sets = await S.api.sets(); } catch (e) { S.sets = []; } }
  return S.sets;
}
/** Cartes d'une extension (cache partagé avec les master sets) */
export async function loadSetCards(id) {
  if (!S.setCards[id]) S.setCards[id] = cacheCards(await S.api.setCards(id));
  return S.setCards[id];
}

export async function renderCatalog(el, params) {
  if (params.get('q') != null) CAT.q = params.get('q');
  if (params.get('set')) CAT.set_id = params.get('set');
  el.innerHTML = `<div class="page-title"><div><h1>Catalogue</h1><p class="sub">Toutes les cartes et leur dernière cote. Ouvrez une fiche pour le détail.</p><p>${langNote()}</p></div></div>
    <section class="panel">
      <form class="form" id="cat-form" role="search" onsubmit="return false">
        <label for="cat-q" style="flex:1 1 240px">Rechercher une carte<input id="cat-q" type="search" placeholder="Dracaufeu, Charizard 151, sv3pt5-199…" value="${esc(CAT.q)}" autocomplete="off"></label>
        <label for="cat-set">Extension<select id="cat-set" class="w-l"><option value="">Toutes</option></select></label>
        <label for="cat-min">Cote mini (€)<input id="cat-min" class="w-s" type="number" min="0" inputmode="decimal" value="${esc(CAT.min)}"></label>
        <label for="cat-max">Cote maxi (€)<input id="cat-max" class="w-s" type="number" min="0" inputmode="decimal" value="${esc(CAT.max)}"></label>
        <label for="cat-sort">Trier par<select id="cat-sort">${[['price', 'Cote décroissante'], ['name', 'Nom'], ['number', 'Numéro'], ['date', 'Date de sortie']].map(([k, v]) => `<option value="${k}"${CAT.sort === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      </form>
      <div class="chips" id="cat-featured"></div>
      <div id="cat-body"><div class="sub">Chargement…</div></div>
    </section>`;
  const sets = await loadSets();
  const sel = $('#cat-set');
  if (!sel) return;
  // Extensions de la langue choisie seulement (une extension d'une autre langue arrivée par lien reste proposée)
  const mine = sets.filter(s => (s.lang || 'EN') === S.cardLang || s.id === CAT.set_id);
  sel.innerHTML = '<option value="">Toutes</option>' + mine.map(s => `<option value="${esc(s.id)}"${CAT.set_id === s.id ? ' selected' : ''}>${esc(s.name)}${s.release_date ? ' (' + s.release_date.slice(0, 4) + ')' : ''}</option>`).join('');
  const featured = (setting('featured_sets', []) || []).map(id => mine.find(s => s.id === id)).filter(Boolean);
  $('#cat-featured').innerHTML = featured.length ? '<span class="sub">À la une :</span>' + featured.map(s => `<button class="chip" type="button" data-set="${esc(s.id)}"><span>${esc(s.name)}</span></button>`).join('') : '';
  $('#cat-featured').addEventListener('click', e => { const b = e.target.closest('[data-set]'); if (b) { sel.value = b.dataset.set; run(); } });

  let seq = 0;
  const run = async () => {
    Object.assign(CAT, { q: $('#cat-q').value.trim(), set_id: sel.value, min: $('#cat-min').value, max: $('#cat-max').value, sort: $('#cat-sort').value });
    const my = ++seq, body = $('#cat-body');
    let rows = [];
    try {
      rows = cacheCards(await S.api.searchCards({ q: CAT.q, lang: CAT.set_id ? '' : S.cardLang, set_id: CAT.set_id, min: CAT.min === '' ? null : +CAT.min, max: CAT.max === '' ? null : +CAT.max, sort: CAT.sort, limit: CAT.set_id ? 500 : 80 }));
    } catch (e) { if (my === seq && body) body.innerHTML = `<div class="empty">Recherche impossible : ${esc(e.message)}</div>`; return; }
    if (my !== seq || !body) return;
    const noPrice = rows.length && rows.every(c => c.price == null);
    const noFilter = !CAT.q && !CAT.set_id && CAT.min === '' && CAT.max === '';
    body.innerHTML = !rows.length ? `<div class="empty">Aucune carte trouvée dans cette langue. Cherchez avec le nom ${S.cardLang === 'FR' ? 'français (ex. « Dracaufeu »)' : 'anglais (ex. « Charizard »)'}, ou changez la langue des cartes en haut de page.</div>` :
      `<div class="sub">${noFilter && !noPrice ? 'Les cartes les plus cotées' : `${rows.length}${rows.length >= (CAT.set_id ? 500 : 80) ? '+' : ''} carte(s)`}${noPrice ? ` · cote ${LANG_NAMES[rows[0].lang] || ''} pas encore disponible : nous ne la remplaçons jamais par celle d'une autre langue` : ''}</div>
      <div class="tbl"><table><thead><tr><th>Carte</th><th>Extension</th><th class="n">Cote</th><th class="n">Relevée le</th></tr></thead><tbody>${rows.map(c => `
        <tr class="go" tabindex="0" data-card="${esc(c.id)}"><td>${cardCell({ ...c, set_name: '' })}</td><td>${esc(c.set_name || '')}<div class="meta">${c.release_date ? c.release_date.slice(0, 4) : ''}</div></td>
        <td class="n">${eur(c.price)}</td><td class="n">${fdate(c.price_date)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  $('#cat-form').addEventListener('input', debounce(run, 280));
  run();
}
