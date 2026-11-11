// Gradation (abonnement Pro) : simulation pour les cartes du Pokédex et meilleures opportunités du marché
// (la base ne les renvoie qu'à Pro). Un compte gratuit voit l'encart Pro.
import { $, esc, eur, sg } from '../util.js';
import { S, hasPro } from '../state.js';
import { needLogin, cardCell, locked } from '../ui.js';
import { GRADERS, PROBA, era, gradeSim, VERD, isGraded, gset, saveGset } from '../grading.js';
import { loadPortfolio } from '../portfolio.js';
import { espaceNav } from './subnav.js';

export async function renderGrading(el) {
  if (!S.user) { el.innerHTML = needLogin('la gradation'); return; }
  if (!hasPro()) {
    el.innerHTML = `${espaceNav('gradation')}${locked({ title: 'Calcul de la gradation', text: 'PSA, PCA ou CCC : pour chaque carte de votre Pokédex, le gain espéré après frais de gradation, d\'envoi et de revente, comparé à la vente brute. Inclus dans l\'abonnement Pro.' })}`;
    return;
  }
  el.innerHTML = `${espaceNav('gradation')}<div id="g-main" class="view"></div>`;
  $('#g-main').innerHTML = `<section class="panel"><div class="head"><div><h2>Faut-il faire grader ?</h2><div class="sub">Gain espéré après frais de gradation, d'envoi et de revente, comparé à la vente brute. Ouvrez une carte pour ajuster la simulation.</div></div>
      <label for="g-who">Société<select id="g-who">${Object.entries(GRADERS).map(([k, g]) => `<option value="${k}"${k === 'PCA' ? ' selected' : ''}>${g.label}</option>`).join('')}</select></label></div>
      <div class="scale" aria-label="Échelle des notes"><span>10 · Gem Mint</span><span>9.5 · Gem Mint (PCA, CGC)</span><span>9 · Mint</span><span>8 · Near Mint-Mint</span><span>7 et moins · usure visible</span></div>
      <div id="g-body"><div class="sub">Chargement…</div></div></section>
    <section class="panel"><h2>Mes frais de gradation</h2><div class="sub">Tarifs par défaut relevés en 2026 sur les grilles publiques. Vérifiez-les avant un envoi ; ils sont gardés sur cet appareil.</div>
      <form class="form" id="g-form">
        <label for="g-ship_fr">Port aller-retour France, par envoi (€)<input id="g-ship_fr" class="w-s" type="number" step="0.5" min="0"></label>
        <label for="g-ship_us">Port aller-retour PSA (USA), par envoi (€)<input id="g-ship_us" class="w-s" type="number" step="0.5" min="0"></label>
        <label for="g-lot">Cartes par envoi<input id="g-lot" class="w-xs" type="number" min="1"></label>
        <label for="g-ins">Assurance (% valeur)<input id="g-ins" class="w-xs" type="number" step="0.1" min="0"></label>
        <label for="g-usd">1 $ en €<input id="g-usd" class="w-xs" type="number" step="0.01" min="0"></label>
        <button class="btn primary" type="submit">Enregistrer mes frais</button></form><div class="msg" id="g-msg"></div></section>`;
  const keys = ['ship_fr', 'ship_us', 'lot', 'ins', 'usd'];
  keys.forEach(k => { $('#g-' + k).value = gset()[k]; });
  const pf = await loadPortfolio();
  let market = [];
  if (hasPro()) { try { market = await S.api.market({ kind: 'buy', limit: 60 }); } catch (e) { market = []; } }
  const cands = new Map();
  for (const p of pf.sum.pos) {
    const cond = pf.txs.filter(t => t.card_id === p.cid && t.side === 'buy').sort((a, b) => b.date.localeCompare(a.date))[0]?.condition;
    if (!isGraded(cond) && p.price) cands.set(p.cid, { c: pf.meta(p.cid) || { id: p.cid, name: p.name }, price: p.price, year: (pf.meta(p.cid)?.release_date || '').slice(0, 4), owned: p.q });
  }
  for (const r of market) if (!cands.has(r.card_id)) cands.set(r.card_id, { c: { ...r, id: r.card_id }, price: r.price, year: (r.release_date || '').slice(0, 4) });
  const draw = () => {
    const who = $('#g-who').value;
    const list = [...cands.values()].map(x => { const pr = PROBA[era(x.year)]; return { ...x, sim: gradeSim(x.price, x.year, who, pr[10], pr[9], {}) }; })
      .filter(x => !x.sim.unavailable).sort((a, b) => b.sim.gain - a.sim.gain);
    $('#g-body').innerHTML = !list.length ? `<div class="empty">Les cartes de votre Pokédex${hasPro() ? ' et les meilleures opportunités' : ''} apparaîtront ici avec leur simulation. Pour une autre carte, ouvrez sa fiche : la simulation y est aussi.</div>` :
      `<div class="tbl"><table><thead><tr><th>Carte</th><th class="n">Cote brute</th><th class="n">Estimé note 10</th><th class="n">Frais tout compris</th><th class="n">Gain espéré</th><th>Verdict</th></tr></thead><tbody>${list.map(x => `
        <tr class="go" tabindex="0" data-card="${esc(x.c.id)}"><td>${cardCell(x.c, x.owned ? ' · dans mon Pokédex' : '')}</td><td class="n">${eur(x.price)}</td><td class="n">${eur(x.sim.rows[0].v)}</td>
        <td class="n">${eur(x.sim.cost)}</td><td class="n">${sg(x.sim.gain)}</td><td><span class="pill ${VERD[x.sim.verdict][2]}">${VERD[x.sim.verdict][1].split(',')[0].toUpperCase()}</span></td></tr>`).join('')}</tbody></table></div>`;
  };
  $('#g-who').addEventListener('change', draw);
  $('#g-form').addEventListener('submit', e => {
    e.preventDefault();
    const v = Object.fromEntries(keys.map(k => [k, parseFloat($('#g-' + k).value)]));
    if (Object.values(v).some(x => !(x >= 0)) || v.lot < 1) { $('#g-msg').textContent = 'Vérifiez les montants : positifs, avec au moins une carte par envoi.'; return; }
    saveGset(v); $('#g-msg').textContent = 'Frais enregistrés.'; draw();
  });
  draw();
}
