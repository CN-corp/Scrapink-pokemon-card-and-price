// « Quand acheter, quand vendre » : prix d'achat conseillé et objectif de revente, à partir de l'analyse
// du jour (fourchette estimée à 30 jours, volatilité, scores). Indicateurs statistiques, pas un conseil financier.
import { netSale } from './fifo.js';

const round2 = v => Math.round(v * 100) / 100;

/** a = ligne d'analyse (market_view), éventuellement personnalisée (personalSignal) ; owned = carte détenue.
 *  Mêmes seuils que les signaux (fifo.js signalLabel) : ACHAT dès 62, RENFORCER dès 68, VENDRE dès 70, ALLÉGER dès 60. */
export function tradeZones(a, owned = false) {
  if (!a || a.price == null) return null;
  const price = +a.price, vol = Math.min(0.35, Math.max(0.04, +a.vol30 || 0.1));
  let buyBelow = a.est30_low != null ? Math.min(price, +a.est30_low) : price * (1 - vol);
  let sellAbove = a.est30_high != null ? Math.max(price, +a.est30_high) : price * (1 + vol);
  if (a.ath_365 != null && +a.ath_365 > price) sellAbove = Math.min(sellAbove, +a.ath_365 * 1.05);
  const buyNow = +a.buy_score >= (owned ? 68 : 62), sellNow = +a.sell_score >= (owned ? 60 : 70);
  if (buyNow) buyBelow = Math.max(buyBelow, price);
  if (sellNow) sellAbove = Math.min(sellAbove, price);
  if (sellAbove < buyBelow * 1.05) sellAbove = buyBelow * 1.05;
  const verdict = buyNow && !sellNow ? 'buy' : sellNow && !buyNow ? 'sell' : 'wait';
  return { price, buyBelow: round2(buyBelow), sellAbove: round2(sellAbove), sellNet: round2(netSale(sellAbove)), verdict,
    gapBuy: buyBelow / price - 1, gapSell: sellAbove / price - 1 };
}

export const VERDICT_TEXT = {
  buy: ['v-good', 'Bon moment pour acheter'],
  sell: ['v-bad', 'Bon moment pour vendre, pas pour acheter'],
  wait: ['v-mid', 'Patienter : achetez sous le prix conseillé, vendez au-dessus de l\'objectif'],
};
