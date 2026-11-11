// Chargement du Pokédex de l'utilisateur : transactions, cotes actuelles, analyse (si Pro), conseils.
import { S, hasPro, cacheCards } from './state.js';
import { summary, personalSignal } from './fifo.js';

export async function loadPortfolio({ withAnalysis = hasPro() } = {}) {
  const [txs, wish] = await Promise.all([S.api.transactions(), S.api.wishlist().catch(() => [])]);
  const ids = [...new Set([...txs.map(t => t.card_id), ...wish.map(w => w.card_id)])];
  const cards = ids.length ? cacheCards(await S.api.cardsByIds(ids)) : [];
  const cmap = new Map(cards.map(c => [c.id, c]));
  const priceOf = id => cmap.get(id)?.price ?? null;
  const meta = id => cmap.get(id);
  const sum = summary(txs, priceOf, meta);
  let ana = new Map();
  if (withAnalysis && ids.length) { try { ana = new Map((await S.api.analysisByIds(ids)).map(a => [a.card_id, a])); } catch (e) { ana = new Map(); } }
  const targets = Object.fromEntries(wish.map(w => [w.card_id, w.target_price]));
  for (const p of sum.pos) p.sig = personalSignal(ana.get(p.cid), p, targets[p.cid]);
  return { txs, wish, cmap, priceOf, meta, sum, ana, targets };
}
