"""Pokédex : positions, plus/moins-values (FIFO), performance depuis le jour zéro, rapports mensuels."""
import bisect
from collections import defaultdict, deque
from datetime import date, timedelta

from . import config, db


def add_transaction(conn, card_id, side, quantity, unit_price, on_date=None, fees=0.0,
                    condition="NM", language="FR", platform=None, notes=None):
    if side not in ("buy", "sell"):
        raise ValueError("side doit valoir 'buy' ou 'sell'")
    if int(quantity) <= 0:
        raise ValueError("La quantité doit être positive")
    if float(unit_price) < 0 or float(fees or 0) < 0:
        raise ValueError("Le prix et les frais ne peuvent pas être négatifs")
    if not conn.execute("SELECT 1 FROM cards WHERE id=?", (card_id,)).fetchone():
        raise ValueError(f"Carte inconnue : {card_id} (lancez une synchro ou utilisez la recherche)")
    on_date = on_date or date.today().isoformat()
    if side == "sell":
        held = holdings(conn, until=on_date).get(card_id, 0)
        if quantity > held:
            raise ValueError(f"Vente impossible : vous ne détenez que {held} exemplaire(s) au {on_date}")
    cur = conn.execute(
        """INSERT INTO transactions (card_id,side,date,quantity,unit_price,fees,condition,language,platform,notes)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (card_id, side, on_date, int(quantity), float(unit_price), float(fees or 0), condition, language, platform, notes),
    )
    return cur.lastrowid


def delete_transaction(conn, tx_id):
    conn.execute("DELETE FROM transactions WHERE id=?", (tx_id,))


def transactions(conn):
    return [dict(r) for r in conn.execute(
        """SELECT t.*, c.name, c.set_name, c.number, c.rarity, c.image_small
           FROM transactions t LEFT JOIN cards c ON c.id = t.card_id
           ORDER BY t.date, t.id""")]


def holdings(conn, until=None):
    q = "SELECT card_id, SUM(CASE side WHEN 'buy' THEN quantity ELSE -quantity END) q FROM transactions"
    args = []
    if until:
        q += " WHERE date <= ?"
        args.append(until)
    q += " GROUP BY card_id"
    return {r["card_id"]: r["q"] for r in conn.execute(q, args) if r["q"]}


def run_fifo(txs):
    """Rejoue les transactions en FIFO. Renvoie lots ouverts et ventes réalisées."""
    lots = defaultdict(deque)          # card_id -> deque[[qty, unit_cost, date]]
    realized = []                      # une ligne par vente
    for t in txs:
        cid = t["card_id"]
        if t["side"] == "buy":
            unit_cost = t["unit_price"] + (t["fees"] or 0) / t["quantity"]
            lots[cid].append([t["quantity"], unit_cost, t["date"]])
            continue
        qty = t["quantity"]
        net_unit = t["unit_price"] - (t["fees"] or 0) / t["quantity"]
        cost = 0.0
        held_days = 0.0
        remaining = qty
        while remaining > 0 and lots[cid]:
            lot = lots[cid][0]
            take = min(lot[0], remaining)
            cost += take * lot[1]
            held_days += take * (date.fromisoformat(t["date"]) - date.fromisoformat(lot[2])).days
            lot[0] -= take
            remaining -= take
            if lot[0] == 0:
                lots[cid].popleft()
        matched = qty - remaining
        proceeds = net_unit * matched
        realized.append({
            "tx_id": t["id"], "card_id": cid, "name": t.get("name"), "date": t["date"], "quantity": matched,
            "proceeds": round(proceeds, 2), "cost": round(cost, 2), "pnl": round(proceeds - cost, 2),
            "pnl_pct": round((proceeds - cost) / cost * 100, 1) if cost else None,
            "avg_hold_days": round(held_days / matched) if matched else None,
        })
    return lots, realized


class PriceBook:
    """Accès rapide au dernier prix connu à une date (report du dernier relevé)."""

    def __init__(self, conn, card_ids):
        self.series = {}
        for cid in card_ids:
            s = db.price_series(conn, cid)
            self.series[cid] = ([d for d, _ in s], [p for _, p in s])

    def at(self, cid, d):
        dates, prices = self.series.get(cid, ([], []))
        i = bisect.bisect_right(dates, d) - 1
        return prices[i] if i >= 0 else None

    def last(self, cid):
        dates, prices = self.series.get(cid, ([], []))
        return prices[-1] if prices else None


def positions(conn):
    txs = transactions(conn)
    lots, realized = run_fifo(txs)
    names = {t["card_id"]: t for t in txs}
    book = PriceBook(conn, list(lots.keys()))
    targets = {r["card_id"]: dict(r) for r in conn.execute("SELECT * FROM targets")}
    out = []
    for cid, dq in lots.items():
        qty = sum(l[0] for l in dq)
        if qty <= 0:
            continue
        cost = sum(l[0] * l[1] for l in dq)
        price = book.last(cid)
        value = qty * price if price else None
        net_value = qty * max(0.0, price * (1 - config.SELL_FEE_PCT) - config.SELL_FIXED_FEE) if price else None
        info = names[cid]
        first = min(l[2] for l in dq)
        out.append({
            "card_id": cid, "name": info.get("name"), "set_name": info.get("set_name"),
            "number": info.get("number"), "rarity": info.get("rarity"), "image_small": info.get("image_small"),
            "quantity": qty, "avg_cost": round(cost / qty, 2), "cost": round(cost, 2),
            "price": price, "value": round(value, 2) if value is not None else None,
            "net_value": round(net_value, 2) if net_value is not None else None,
            "unrealized": round(value - cost, 2) if value is not None else None,
            "unrealized_pct": round((value - cost) / cost * 100, 1) if value is not None and cost else None,
            "held_since": first, "target": targets.get(cid),
        })
    total_value = sum(p["value"] or 0 for p in out)
    for p in out:
        p["weight"] = round((p["value"] or 0) / total_value, 4) if total_value else 0
    out.sort(key=lambda p: -(p["value"] or 0))
    return out, realized


def equity_curve(conn, until=None):
    """Courbe jour par jour depuis le jour zéro (premier achat).

    invested   : total décaissé en achats (prix + frais)
    proceeds   : total encaissé en ventes (net de frais)
    value      : valeur de marché des cartes détenues
    pnl        : value + proceeds - invested
    twr_index  : indice base 100 « time-weighted » (neutralise les apports/retraits)
    """
    txs = transactions(conn)
    if not txs:
        return []
    day0 = date.fromisoformat(txs[0]["date"])
    end = date.fromisoformat(until) if until else date.today()
    book = PriceBook(conn, {t["card_id"] for t in txs})
    by_day = defaultdict(list)
    for t in txs:
        by_day[t["date"]].append(t)

    qty = defaultdict(int)
    invested = proceeds = 0.0
    prev_value = 0.0
    index = 100.0
    curve = []
    d = day0
    while d <= end:
        ds = d.isoformat()
        flow = 0.0  # >0 : argent mis dans le portefeuille, <0 : argent retiré
        for t in by_day.get(ds, []):
            gross = t["quantity"] * t["unit_price"]
            if t["side"] == "buy":
                qty[t["card_id"]] += t["quantity"]
                invested += gross + (t["fees"] or 0)
                flow += gross + (t["fees"] or 0)
            else:
                qty[t["card_id"]] -= t["quantity"]
                proceeds += gross - (t["fees"] or 0)
                flow -= gross - (t["fees"] or 0)
        value = 0.0
        for cid, q in qty.items():
            if q > 0:
                p = book.at(cid, ds)
                if p is None:  # pas encore de cote : on valorise au dernier prix d'achat
                    p = next((t["unit_price"] for t in reversed(txs) if t["card_id"] == cid and t["date"] <= ds and t["side"] == "buy"), 0)
                value += q * p
        base = prev_value + max(flow, 0)
        if base > 0:
            index *= (value - min(flow, 0)) / base
        prev_value = value
        curve.append({
            "date": ds, "invested": round(invested, 2), "proceeds": round(proceeds, 2),
            "value": round(value, 2), "pnl": round(value + proceeds - invested, 2),
            "roi_pct": round((value + proceeds - invested) / invested * 100, 2) if invested else 0,
            "twr_index": round(index, 2),
        })
        d += timedelta(days=1)
    return curve


def summary(conn):
    pos, realized = positions(conn)
    curve = equity_curve(conn)
    last = curve[-1] if curve else {"invested": 0, "proceeds": 0, "value": 0, "pnl": 0, "roi_pct": 0, "twr_index": 100}
    wins = [r for r in realized if r["pnl"] > 0]
    peak, max_dd = 0, 0.0
    for c in curve:
        peak = max(peak, c["twr_index"])
        if peak:
            max_dd = min(max_dd, c["twr_index"] / peak - 1)
    return {
        "day_zero": curve[0]["date"] if curve else None,
        "days": len(curve),
        "invested": last["invested"], "proceeds": last["proceeds"], "value": last["value"],
        "net_liquidation_value": round(sum(p["net_value"] or 0 for p in pos), 2),
        "pnl": last["pnl"], "roi_pct": last["roi_pct"],
        "twr_pct": round(last["twr_index"] - 100, 2),
        "realized_pnl": round(sum(r["pnl"] for r in realized), 2),
        "unrealized_pnl": round(sum(p["unrealized"] or 0 for p in pos), 2),
        "positions": len(pos), "cards_held": sum(p["quantity"] for p in pos),
        "trades_closed": len(realized),
        "win_rate_pct": round(len(wins) / len(realized) * 100, 1) if realized else None,
        "max_drawdown_pct": round(max_dd * 100, 2),
    }


def _month_bounds(month):
    y, m = map(int, month.split("-"))
    start = date(y, m, 1)
    end = date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
    return start, end


def monthly_report(conn, month):
    """Rapport du mois 'AAAA-MM'."""
    start, end = _month_bounds(month)
    end = min(end, date.today())
    curve = equity_curve(conn, until=end.isoformat())
    if not curve:
        return None
    by_date = {c["date"]: c for c in curve}
    before = (start - timedelta(days=1)).isoformat()
    c0 = by_date.get(before) or {"invested": 0, "proceeds": 0, "value": 0, "pnl": 0, "twr_index": 100}
    c1 = curve[-1]
    txs = [t for t in transactions(conn) if start.isoformat() <= t["date"] <= end.isoformat()]
    _, realized = run_fifo(transactions(conn))
    realized_m = [r for r in realized if start.isoformat() <= r["date"] <= end.isoformat()]
    buys = [t for t in txs if t["side"] == "buy"]
    sells = [t for t in txs if t["side"] == "sell"]
    pnl_month = c1["pnl"] - c0["pnl"]
    return {
        "month": month,
        "period": [start.isoformat(), end.isoformat()],
        "value_start": c0["value"], "value_end": c1["value"],
        "bought": round(sum(t["quantity"] * t["unit_price"] + (t["fees"] or 0) for t in buys), 2),
        "sold": round(sum(t["quantity"] * t["unit_price"] - (t["fees"] or 0) for t in sells), 2),
        "n_buys": sum(t["quantity"] for t in buys), "n_sells": sum(t["quantity"] for t in sells),
        "realized_pnl": round(sum(r["pnl"] for r in realized_m), 2),
        "unrealized_change": round(pnl_month - sum(r["pnl"] for r in realized_m), 2),
        "pnl_month": round(pnl_month, 2),
        "twr_month_pct": round((c1["twr_index"] / c0["twr_index"] - 1) * 100, 2) if c0["twr_index"] else None,
        "pnl_since_day_zero": c1["pnl"], "roi_since_day_zero_pct": c1["roi_pct"],
        "twr_since_day_zero_pct": round(c1["twr_index"] - 100, 2),
        "best_trades": sorted(realized_m, key=lambda r: -r["pnl"])[:5],
        "worst_trades": sorted(realized_m, key=lambda r: r["pnl"])[:3],
        "transactions": txs,
    }


def months_available(conn):
    r = conn.execute("SELECT MIN(date) a FROM transactions").fetchone()
    if not r or not r["a"]:
        return []
    d = date.fromisoformat(r["a"]).replace(day=1)
    out = []
    while d <= date.today():
        out.append(d.strftime("%Y-%m"))
        d = (d + timedelta(days=32)).replace(day=1)
    return out
