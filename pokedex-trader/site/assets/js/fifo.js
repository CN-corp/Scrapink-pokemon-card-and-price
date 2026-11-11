// Pokédex : plus-values en FIFO (premier acheté, premier vendu), positions, conseils personnalisés,
// rapports mensuels. Même logique que pokedex_trader/portfolio.py et analysis.py.

export const SELL_FEE_PCT = 0.05;
export const SELL_FIXED_FEE = 1.2;
export const MAX_WEIGHT = 0.15;
export const netSale = v => Math.max(0, v * (1 - SELL_FEE_PCT) - SELL_FIXED_FEE);

const sortTx = txs => [...txs].sort((a, b) => a.date.localeCompare(b.date) || (a.side === 'buy' ? -1 : 1) || (a.created_at || '').localeCompare(b.created_at || ''));

export function fifo(txs) {
  const lots = {}, realized = [];
  for (const t of sortTx(txs)) {
    const L = lots[t.card_id] ||= [];
    const q = +t.quantity, fees = +(t.fees || 0), price = +t.unit_price;
    if (t.side === 'buy') { L.push({ q, c: price + fees / q, d: t.date }); continue; }
    let rem = q, cost = 0, held = 0;
    while (rem > 0 && L.length) {
      const l = L[0], k = Math.min(l.q, rem);
      cost += k * l.c; held += k * ((new Date(t.date) - new Date(l.d)) / 864e5);
      l.q -= k; rem -= k; if (!l.q) L.shift();
    }
    const m = q - rem, net = (price - fees / q) * m;
    realized.push({ id: t.id, date: t.date, card_id: t.card_id, q: m, cost, net, pnl: net - cost, days: m ? Math.round(held / m) : null });
  }
  return { lots, realized };
}

/** priceOf(card_id) -> cote actuelle ou null ; meta(card_id) -> carte */
export function positions(txs, priceOf, meta = () => ({})) {
  const { lots, realized } = fifo(txs);
  const pos = [];
  for (const [cid, L] of Object.entries(lots)) {
    const q = L.reduce((a, l) => a + l.q, 0);
    if (!q) continue;
    const cost = L.reduce((a, l) => a + l.q * l.c, 0), p = priceOf(cid), m = meta(cid) || {};
    pos.push({ cid, name: m.name || cid, set_name: m.set_name, number: m.number, image_small: m.image_small, lang: m.lang,
      q, cost, avg: cost / q, price: p, value: p == null ? null : p * q, net: p == null ? null : q * netSale(p),
      since: L.map(l => l.d).sort()[0] });
  }
  const tv = pos.reduce((a, p) => a + (p.value || 0), 0);
  pos.forEach(p => { p.w = tv ? (p.value || 0) / tv : 0; });
  pos.sort((a, b) => (b.value || 0) - (a.value || 0));
  return { pos, realized };
}

export function summary(txs, priceOf, meta) {
  const { pos, realized } = positions(txs, priceOf, meta);
  const invested = txs.filter(t => t.side === 'buy').reduce((a, t) => a + t.quantity * t.unit_price + (+t.fees || 0), 0);
  const value = pos.reduce((a, p) => a + (p.value ?? p.cost), 0);
  const cost = pos.reduce((a, p) => a + p.cost, 0);
  const realizedPnl = realized.reduce((a, r) => a + r.pnl, 0);
  const latent = value - cost;
  const wins = realized.filter(r => r.pnl > 0).length;
  return { pos, realized, invested, value, cost, net: pos.reduce((a, p) => a + (p.net ?? 0), 0), latent, realizedPnl,
    pnl: realizedPnl + latent, pnlPct: invested ? (realizedPnl + latent) / invested : null, trades: txs.length,
    cards: pos.reduce((a, p) => a + p.q, 0), winRate: realized.length ? wins / realized.length : null };
}

export function signalLabel(buy, sell, owned) {
  if (owned) return sell >= 70 ? 'VENDRE' : sell >= 60 ? 'ALLÉGER' : buy >= 68 ? 'RENFORCER' : 'CONSERVER';
  return buy >= 72 ? 'ACHAT FORT' : buy >= 62 ? 'ACHAT' : sell >= 70 ? 'ÉVITER' : 'NEUTRE';
}

/** Conseil personnalisé : analyse neutre + position détenue + objectif de prix (wishlist) */
export function personalSignal(a, p, target) {
  if (!a) return null;
  let b = +a.buy_score, s = +a.sell_score;
  const rb = [...(a.reasons_buy || [])], rs = [...(a.reasons_sell || [])];
  const price = +a.price;
  if (p) {
    const gain = p.avg ? (netSale(price) - p.avg) / p.avg : 0, trend = a.mom30 ?? 0;
    if (gain > 0.5 && s >= 55) { s = Math.min(100, s + 10); rs.push(`plus-value nette de ${Math.round(gain * 100)} % à sécuriser`); }
    if (gain < -0.2 && trend < -0.03) { s = Math.min(100, s + 8); rs.push(`perte de ${Math.round(-gain * 100)} % et tendance négative : couper la position ?`); }
    if (gain < 0 && s < 60 && trend > 0) rb.push('en moins-value mais tendance favorable : patienter');
    if (p.w > MAX_WEIGHT) { b = Math.max(0, b - 15); rs.push(`concentration élevée (${Math.round(p.w * 100)} % du portefeuille)`); }
    if (gain <= 0 && s >= 60) rs.push('vendre maintenant réaliserait une perte après frais');
  }
  if (target != null && price <= target) { b = Math.min(100, b + 20); rb.push(`sous votre prix cible (${target} €)`); }
  return { ...a, buy_score: b, sell_score: s, reasons_buy: rb, reasons_sell: rs, signal: signalLabel(b, s, !!p) };
}

/** Prix d'une carte à une date, à partir de son historique [[date, prix]...] (dernier connu) */
export function priceAt(hist, d) {
  if (!hist?.length) return null;
  let v = null;
  for (const [x, p] of hist) { if (x <= d) v = p; else break; }
  return v ?? hist[0][1];
}

export function monthsOf(txs) {
  if (!txs.length) return [];
  const first = sortTx(txs)[0].date.slice(0, 7), out = [];
  const d = new Date(first + '-01T12:00:00'), end = new Date();
  while (d <= end) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() + 1); }
  return out.reverse();
}

/** Rapport d'un mois (AAAA-MM). histOf(cid) -> historique, priceOf(cid) -> cote actuelle. */
export function monthlyReport(txs, month, histOf, priceOf) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`, endD = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const before = txs.filter(t => t.date < start), upto = txs.filter(t => t.date <= endD);
  const inMonth = txs.filter(t => t.date >= start && t.date <= endD);
  const valueAt = (list, d) => {
    const { lots } = fifo(list);
    let v = 0;
    for (const [cid, L] of Object.entries(lots)) {
      const q = L.reduce((a, l) => a + l.q, 0); if (!q) continue;
      const p = d >= new Date().toISOString().slice(0, 10) ? priceOf(cid) : (priceAt(histOf(cid), d) ?? priceOf(cid));
      v += q * (p ?? L.reduce((a, l) => a + l.q * l.c, 0) / q);
    }
    return v;
  };
  const prevEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  const v0 = valueAt(before, prevEnd), v1 = valueAt(upto, endD);
  const buys = inMonth.filter(t => t.side === 'buy'), sells = inMonth.filter(t => t.side === 'sell');
  const spent = buys.reduce((a, t) => a + t.quantity * t.unit_price + (+t.fees || 0), 0);
  const cashed = sells.reduce((a, t) => a + t.quantity * t.unit_price - (+t.fees || 0), 0);
  const realized = fifo(upto).realized.filter(r => r.date >= start && r.date <= endD);
  return { month, start, end: endD, valueStart: v0, valueEnd: v1, buys, sells, spent, cashed,
    realized, realizedPnl: realized.reduce((a, r) => a + r.pnl, 0), result: v1 - v0 - spent + cashed };
}

/** Courbe de performance jour par jour : dates [AAAA-MM-JJ], histOf(cid) -> [[date, prix]...].
 *  Pour chaque date : valeur à la cote des cartes détenues, capital investi, résultat (réalisé + latent). */
export function perfSeries(txs, dates, histOf, priceOf) {
  if (!txs.length) return [];
  const first = sortTx(txs)[0].date, out = [];
  for (const d of dates) {
    if (d < first) continue;
    const upto = txs.filter(t => t.date <= d);
    const { lots, realized } = fifo(upto);
    let value = 0, cost = 0;
    for (const [cid, L] of Object.entries(lots)) {
      const q = L.reduce((a, l) => a + l.q, 0); if (!q) continue;
      const c = L.reduce((a, l) => a + l.q * l.c, 0), p = priceAt(histOf(cid), d) ?? priceOf(cid);
      value += p == null ? c : q * p; cost += c;
    }
    const invested = upto.filter(t => t.side === 'buy').reduce((a, t) => a + t.quantity * t.unit_price + (+t.fees || 0), 0);
    const pnl = realized.reduce((a, r) => a + r.pnl, 0) + value - cost;
    out.push({ date: d, value: Math.round(value * 100) / 100, invested: Math.round(invested * 100) / 100,
      pnl: Math.round(pnl * 100) / 100, pnl_pct: invested ? Math.round(pnl / invested * 1000) / 10 : null });
  }
  return out;
}
