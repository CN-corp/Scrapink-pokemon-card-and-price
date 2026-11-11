// Gradation : faut-il faire grader une carte ? (même logique que l'outil privé)
// Gain espéré après frais de gradation, d'envoi, d'assurance et de revente, comparé à la vente brute.
import { store } from './util.js';
import { netSale } from './fifo.js';

export const GDEF = { ship_fr: 20, ship_us: 60, lot: 10, ins: 2, usd: 0.92 };
export const gset = () => ({ ...GDEF, ...(store.get('pt-grading', {}) || {}) });
export const saveGset = v => store.set('pt-grading', v);

export const GRADERS = {
  PSA: { label: 'PSA', premium: 1, us: true,
    fee: v => { const s = gset(), d = v / s.usd; const t = d <= 1500 ? ['Regular', 79.99] : d <= 2500 ? ['Express', 149] : d <= 5000 ? ['Super Express', 349] : d <= 10000 ? ['Walk-Through', 599] : null; return t && { tier: t[0], eur: t[1] * s.usd }; } },
  PCA: { label: 'PCA', premium: 0.6,
    fee: v => { const t = v < 250 ? 12.9 : v < 1000 ? 24.9 : v < 10000 ? 79.9 : null; return t && { tier: 'Classic', eur: t }; } },
  CCC: { label: 'CCC Grading', premium: 0.6,
    fee: v => ({ tier: 'Standard', eur: v <= 50 ? 17 : v <= 100 ? 20 : v <= 500 ? 24 : 28 }) },
};
export function era(year) { const y = +year || 2020; return y < 2003 ? 'vintage' : y < 2017 ? 'mid' : 'modern'; }
export const ERA_LABEL = { vintage: 'avant 2003', mid: '2003 à 2016', modern: '2017 et après' };
const MULT = { vintage: { 10: 6, 9: 2.2, 8: 1.3 }, mid: { 10: 3, 9: 1.5, 8: 1.05 }, modern: { 10: 2, 9: 1.15, 8: 0.9 } };
export const PROBA = { vintage: { 10: 5, 9: 25 }, mid: { 10: 15, 9: 40 }, modern: { 10: 35, 9: 45 } };
function mult(e, g, who) {
  const m = MULT[e], base = g === 9.5 ? (m[10] + m[9]) / 2 : m[g];
  return base > 1 ? 1 + (base - 1) * GRADERS[who].premium : base;
}
export const isGraded = c => /^(PSA|PCA|CCC|CGC|BGS)\b/.test(c || '');

export function gradeSim(raw, year, who, p10, p9, observed = {}) {
  const e = era(year), G = GRADERS[who], s = gset();
  const probs = { 10: p10 / 100, 9: p9 / 100 }; probs[8] = Math.max(0, 1 - probs[10] - probs[9]);
  if (who === 'PCA') { probs[9.5] = probs[10] * 0.5; probs[10] *= 0.5; }
  const rows = Object.keys(probs).map(Number).sort((a, b) => b - a).map(g => {
    const obs = observed[`${who} ${g}`]; const v = obs ?? raw * mult(e, g, who);
    return { g, p: probs[g], v, obs: obs != null };
  });
  const declared = rows.reduce((a, r) => a + r.p * r.v, 0);
  const fee = G.fee(declared);
  if (!fee) return { rows, declared, unavailable: true };
  const ship = (G.us ? s.ship_us : s.ship_fr) / Math.max(1, s.lot), ins = declared * s.ins / 100;
  const cost = fee.eur + ship + ins;
  const ev = rows.reduce((a, r) => a + r.p * netSale(r.v), 0);
  const rawNet = netSale(raw), gain = ev - cost - rawNet;
  const verdict = gain > Math.max(10, raw * 0.15) ? 'good' : gain > 0 ? 'mid' : 'bad';
  return { rows, declared, fee, ship, ins, cost, ev, rawNet, gain, verdict, era: e };
}
export const VERD = { good: ['v-good', 'Rentable à grader', 'p-buy'], mid: ['v-mid', 'Marge faible', 'p-warn'], bad: ['v-bad', 'Pas rentable, mieux vaut vendre brute', 'p-sell'] };
