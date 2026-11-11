"""Moteur d'analyse : indicateurs, estimations de prix et signaux d'achat / vente.

Pour chaque carte cotée :
  - momentum 7 / 30 / 90 j (historique local, sinon moyennes Cardmarket avg1/avg7/avg30)
  - moyennes mobiles 30 / 90 j, z-score, RSI 14, volatilité mensuelle, drawdown depuis le plus haut
  - tendance : régression linéaire du log-prix sur 90 j -> estimation à 30 et 90 j + fourchette
  - décote : prix plancher (low) vs prix tendance, Cardmarket vs TCGPlayer (arbitrage)
  - rendement espéré NET de frais de revente
Les signaux sont ensuite croisés avec le Pokédex (cartes détenues, prix de revient, poids).
"""
import math
from collections import defaultdict
from statistics import mean, pstdev

from . import config, db, portfolio


def _rsi(prices, n=14):
    if len(prices) <= n:
        return None
    gains = losses = 0.0
    for a, b in zip(prices[-n - 1:-1], prices[-n:]):
        d = b - a
        gains += max(d, 0)
        losses += max(-d, 0)
    if losses == 0:
        return 100.0
    rs = (gains / n) / (losses / n)
    return 100 - 100 / (1 + rs)


def _regression(ys):
    """Pente / R² d'une régression linéaire simple."""
    n = len(ys)
    if n < 10:
        return None, None
    xs = range(n)
    mx, my = (n - 1) / 2, mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    slope = sxy / sxx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (my + slope * (x - mx))) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - ss_res / ss_tot if ss_tot else 0
    return slope, max(0.0, r2)


def _pct(a, b):
    return (a / b - 1) if a and b else None


def net_sale(price):
    return price * (1 - config.SELL_FEE_PCT) - config.SELL_FIXED_FEE


def indicators(series, snap=None, other_market=None):
    """series : liste de prix journaliers (ancien -> récent). snap : dernier relevé (avg1/7/30, low)."""
    p = series[-1]
    n = len(series)
    snap = snap or {}
    ind = {"price": round(p, 2), "history_days": n}

    def back(k):
        return series[-k - 1] if n > k else None

    m7 = _pct(p, back(7))
    m30 = _pct(p, back(30))
    m90 = _pct(p, back(90))
    # Historique local trop court : on s'appuie sur les moyennes de Cardmarket
    if m7 is None and snap.get("avg7"):
        m7 = _pct(snap.get("avg1") or p, snap["avg7"])
    if m30 is None and snap.get("avg30"):
        m30 = _pct(snap.get("avg7") or p, snap["avg30"])
    ind.update(mom7=m7, mom30=m30, mom90=m90, mom365=_pct(p, back(365)))
    # Tendance de fond sur tout l'historique disponible (1 point par semaine), en %/an
    if n >= 180:
        wk = [math.log(x) for x in series[::-7][::-1] if x > 0]
        lt, lt_r2 = _regression(wk)
        ind["trend_year"] = math.exp(lt * 52) - 1 if lt is not None else None
        ind["trend_year_r2"] = lt_r2
    else:
        ind["trend_year"] = ind["trend_year_r2"] = None

    w30 = series[-30:]
    w90 = series[-90:]
    sma30 = mean(w30) if n >= 10 else snap.get("avg30")
    sma90 = mean(w90) if n >= 45 else None
    sd30 = pstdev(w30) if n >= 10 else None
    ind["sma30"] = sma30
    ind["sma90"] = sma90
    ind["zscore"] = (p - sma30) / sd30 if sd30 else None
    ind["rsi"] = _rsi(series)
    rets = [math.log(b / a) for a, b in zip(series[-91:-1], series[-90:]) if a > 0 and b > 0]
    ind["vol30"] = pstdev(rets) * math.sqrt(30) if len(rets) >= 10 else None
    hi = max(series[-365:])
    ind["drawdown"] = p / hi - 1
    ind["ath_365"] = hi

    slope, r2 = _regression([math.log(x) for x in w90 if x > 0]) if n >= 20 else (None, None)
    ind["trend_slope_month"] = slope * 30 if slope is not None else (m30 if m30 is not None else None)
    ind["trend_r2"] = r2
    # Estimation : tendance amortie (shrinkage vers 0 quand R² faible) + retour partiel vers la moyenne
    drift = (slope or 0) * (0.35 + 0.65 * (r2 or 0)) if slope is not None else (m30 or 0) / 30 * 0.4
    revert = 0.0
    if ind["zscore"] is not None and sma30:
        revert = -0.25 * (p - sma30) / p  # 25 % de l'écart à la moyenne se résorbe en ~30 j
    vol = ind["vol30"] if ind["vol30"] is not None else 0.12
    # Bornes : une cote aberrante (ex. avg30 Cardmarket à 0,02 €) ne doit pas faire planter l'export
    est30 = p * math.exp(max(-3.0, min(3.0, drift * 30 + revert)))
    est90 = p * math.exp(max(-3.0, min(3.0, drift * 90 * 0.8 + revert)))
    ind["est30"] = round(est30, 2)
    ind["est90"] = round(est90, 2)
    ind["est30_range"] = [round(est30 * math.exp(-vol), 2), round(est30 * math.exp(vol), 2)]
    ind["exp_return30_net"] = (net_sale(est30) - p) / p
    ind["exp_return90_net"] = (net_sale(est90) - p) / p

    low = snap.get("low")
    ind["low_discount"] = (1 - low / p) if low and low < p else None
    ind["other_market"] = other_market
    ind["cross_market_gap"] = (other_market / p - 1) if other_market else None
    return ind


def score(ind):
    """Renvoie (score_achat 0-100, score_vente 0-100, raisons)."""
    buy = sell = 50.0
    why_buy, why_sell = [], []
    m7, m30, m90 = ind["mom7"], ind["mom30"], ind["mom90"]
    z, rsi, vol = ind["zscore"], ind["rsi"], ind["vol30"]
    slope, r2 = ind["trend_slope_month"], ind["trend_r2"] or 0

    if slope is not None:
        s = max(-0.3, min(0.3, slope))
        buy += s * 100 * (0.5 + r2)
        sell -= s * 100 * (0.5 + r2)
        if slope > 0.03 and r2 > 0.4:
            why_buy.append(f"tendance haussière solide (+{slope*100:.0f} %/mois, R² {r2:.2f})")
        elif slope < -0.03 and r2 > 0.4:
            why_sell.append(f"tendance baissière installée ({slope*100:.0f} %/mois)")

    # Achat sur repli : prix sous sa moyenne 30 j alors que la tendance de fond monte
    if z is not None:
        if z < -1.2 and (m90 or slope or 0) > 0:
            buy += 12
            why_buy.append(f"repli temporaire sous la moyenne 30 j (z = {z:.1f}) dans une tendance haussière")
        if z > 2:
            sell += 15
            buy -= 10
            why_sell.append(f"pic de prix au-dessus de la normale (z = {z:.1f})")
    if rsi is not None:
        if rsi > 75:
            sell += 10
            buy -= 8
            why_sell.append(f"surachat (RSI {rsi:.0f})")
        elif rsi < 25:
            buy += 8
            why_buy.append(f"survente (RSI {rsi:.0f})")
    if m7 is not None and m30 is not None and m30 > 0.15 and m7 < -0.03:
        sell += 10
        why_sell.append(f"essoufflement : +{m30*100:.0f} % sur 30 j mais {m7*100:.0f} % sur 7 j")
    if m7 is not None and m30 is not None and m30 < -0.1 and m7 > 0.03:
        buy += 6
        why_buy.append("rebond après une baisse")
    if ind["drawdown"] is not None and ind["drawdown"] < -0.4 and (m30 or 0) >= 0:
        buy += 6
        why_buy.append(f"{ind['drawdown']*100:.0f} % sous son plus haut 1 an, baisse stabilisée")
    # Au-delà de 50 % d'écart, l'offre la plus basse est presque toujours une carte abîmée ou une autre langue
    if ind["low_discount"] and 0.2 < ind["low_discount"] <= 0.5:
        buy += 6
        why_buy.append(f"offres disponibles {ind['low_discount']*100:.0f} % sous le prix tendance")
    gap = ind["cross_market_gap"]
    # Un écart de plus de 100 % vient d'une variante mal rapprochée, pas d'une vraie opportunité
    if gap is not None and 0.25 < gap <= 1.0:
        buy += 8
        why_buy.append(f"arbitrage : TCGPlayer {gap*100:.0f} % plus cher que Cardmarket")
    if vol is not None and vol > 0.35:
        buy -= 8
        why_buy.append(f"attention, forte volatilité ({vol*100:.0f} %/mois)")

    ty, ty_r2 = ind.get("trend_year"), ind.get("trend_year_r2") or 0
    if ty is not None:
        t = max(-0.5, min(0.5, ty))
        buy += t * 20 * (0.5 + ty_r2)
        sell -= t * 14 * (0.5 + ty_r2)
        if ty > 0.15 and ty_r2 > 0.5:
            why_buy.append(f"valeur de fond en hausse : +{ty*100:.0f} %/an depuis {ind['history_days'] // 30} mois")
        elif ty < -0.15 and ty_r2 > 0.5:
            why_sell.append(f"érosion de long terme : {ty*100:.0f} %/an")
    er = ind["exp_return30_net"]
    buy += max(-15, min(15, er * 100 * 0.6))
    if er > 0.05:
        why_buy.append(f"gain estimé à 30 j après frais : +{er*100:.0f} %")
    if ind["exp_return90_net"] < -0.1:
        sell += 6
    return round(max(0, min(100, buy)), 1), round(max(0, min(100, sell)), 1), why_buy, why_sell


def label(buy, sell, owned):
    if owned:
        if sell >= 70:
            return "VENDRE"
        if sell >= 60:
            return "ALLÉGER"
        if buy >= 68:
            return "RENFORCER"
        return "CONSERVER"
    if buy >= 72:
        return "ACHAT FORT"
    if buy >= 62:
        return "ACHAT"
    if sell >= 70:
        return "ÉVITER"
    return "NEUTRE"


def _load_market(conn, card_ids=None):
    """Charge en une passe les séries et les derniers relevés de toutes les cartes."""
    where = ""
    args = []
    if card_ids is not None:
        card_ids = list(card_ids)
        if not card_ids:
            return {}, {}, {}
        where = f"WHERE card_id IN ({','.join('?' * len(card_ids))})"
        args = card_ids
    rows = defaultdict(list)
    # Chaque carte n'a que sa propre série en euros. Pas de comparaison avec TCGplayer (marché américain,
    # en dollars) : le troisième élément renvoyé reste vide pour ne jamais rapprocher deux marchés.
    tcg = {}
    snaps = {}
    for r in conn.execute(
        f"""SELECT card_id, date, source, variant, price, low, avg1, avg7, avg30 FROM prices {where}
            ORDER BY date""", args):
        if r["price"] is None:
            continue
        cid, src = r["card_id"], r["source"]
        rows[cid].append((r["date"], src, r["variant"], r["price"]))
        if src in db.EUR_SOURCES and r["variant"] == "normal":
            snaps[cid] = dict(r)
    series = {cid: s for cid, s in ((cid, db.splice(rs)) for cid, rs in rows.items()) if s}
    return series, snaps, tcg


def _daily(by_date):
    """Série jour par jour (le dernier prix connu est reporté sur les jours sans relevé)."""
    from datetime import date, timedelta
    ds = sorted(by_date)
    if not ds:
        return []
    out, d, end, last, i = [], date.fromisoformat(ds[0]), date.fromisoformat(ds[-1]), None, 0
    while d <= end:
        k = d.isoformat()
        if i < len(ds) and ds[i] == k:
            last = by_date[k][1]
            i += 1
        out.append(last)
        d += timedelta(days=1)
    return out


def confidence(ind, snap=None):
    """Qualité du signal, 0-100 : profondeur d'historique, régularité de la tendance,
    volatilité, accord entre marchés et présence d'offres."""
    days = ind.get("history_days") or 0
    c = 35 * min(1.0, days / 365)
    c += 25 * (ind.get("trend_r2") or 0)
    vol = ind.get("vol30")
    c += 20 * (1 - min(vol, 0.6) / 0.6) if vol is not None else 6
    gap = ind.get("cross_market_gap")
    c += 10 * max(0.0, 1 - min(abs(gap), 0.5) / 0.5) if gap is not None else 4
    snap = snap or {}
    c += 10 if (snap.get("low") and snap.get("avg1")) else 5 if snap else 2
    return round(min(100.0, c), 1)


def analyze(conn, card_ids=None, min_price=None):
    min_price = config.MIN_TRADE_PRICE if min_price is None else min_price
    series, snaps, tcg = _load_market(conn, card_ids)
    pos, _ = portfolio.positions(conn)
    owned = {p["card_id"]: p for p in pos}
    targets = {r["card_id"]: dict(r) for r in conn.execute("SELECT * FROM targets")}
    meta = {}
    ids = list(series.keys())
    for i in range(0, len(ids), 900):
        chunk = ids[i:i + 900]
        for r in conn.execute(f"SELECT * FROM cards WHERE id IN ({','.join('?' * len(chunk))})", chunk):
            meta[r["id"]] = dict(r)

    out = []
    for cid, by_date in series.items():
        prices = _daily(by_date)
        if not prices or (prices[-1] < min_price and cid not in owned):
            continue
        snap = snaps.get(cid)
        cm_price = snap["price"] if snap else None
        other = tcg[cid][1] if cm_price and cid in tcg else None
        ind = indicators(prices, snap, other)
        b, s, why_b, why_s = score(ind)
        m = meta.get(cid, {})
        rec = {
            "card_id": cid, "name": m.get("name"), "set_name": m.get("set_name"), "number": m.get("number"),
            "rarity": m.get("rarity"), "image_small": m.get("image_small"), "image_large": m.get("image_large"),
            "release_date": m.get("release_date"),
            "buy_score": b, "sell_score": s, "reasons_buy": why_b, "reasons_sell": why_s,
            **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in ind.items()},
        }
        p = owned.get(cid)
        t = targets.get(cid) or {}
        if p:
            # Conseils personnalisés à partir du Pokédex
            net_now = net_sale(ind["price"])
            gain_net = (net_now - p["avg_cost"]) / p["avg_cost"] if p["avg_cost"] else 0
            rec.update(owned_qty=p["quantity"], avg_cost=p["avg_cost"], gain_net_pct=round(gain_net * 100, 1),
                       weight=p["weight"])
            if gain_net > 0.5 and s >= 55:
                rec["sell_score"] = s = min(100, s + 10)
                rec["reasons_sell"].append(f"plus-value nette de {gain_net*100:.0f} % à sécuriser")
            if gain_net < -0.2 and (ind["trend_slope_month"] or 0) < -0.03:
                rec["sell_score"] = s = min(100, s + 8)
                rec["reasons_sell"].append(f"perte de {-gain_net*100:.0f} % et tendance négative : couper la position ?")
            if gain_net < 0 and s < 60 and (ind["trend_slope_month"] or 0) > 0:
                rec["reasons_buy"].append("en moins-value mais tendance favorable : patienter")
            if p["weight"] > config.MAX_POSITION_WEIGHT:
                rec["buy_score"] = b = max(0, b - 15)
                rec["reasons_sell"].append(f"concentration élevée ({p['weight']*100:.0f} % du portefeuille)")
            if gain_net <= 0 and s >= 60:
                rec["reasons_sell"].append("vendre maintenant réaliserait une perte après frais")
        if t.get("sell_above") and ind["price"] >= t["sell_above"]:
            rec["sell_score"] = s = min(100, s + 20)
            rec["reasons_sell"].append(f"objectif de vente atteint ({t['sell_above']} €)")
        if t.get("buy_below") and ind["price"] <= t["buy_below"]:
            rec["buy_score"] = b = min(100, b + 20)
            rec["reasons_buy"].append(f"sous votre prix d'achat cible ({t['buy_below']} €)")
        rec["signal"] = label(b, s, bool(p))
        rec["lang"] = m.get("lang") or "EN"
        if m.get("ref_id"):
            rec["fr_observed"] = any(v[0] == "manual" for v in by_date.values())
        rec["confidence"] = conf = confidence(ind, snap)
        # Note de classement : le score, pondéré par la fiabilité de l'analyse
        rec["rank_buy"] = round(b * (0.6 + 0.4 * conf / 100), 1)
        rec["rank_sell"] = round(s * (0.6 + 0.4 * conf / 100), 1)
        out.append(rec)
    return out


def opportunities(conn, kind="buy", limit=50, **kw):
    res = analyze(conn, **kw)
    if kind == "buy":
        res = [r for r in res if r.get("owned_qty") is None or r["signal"] == "RENFORCER"]
        res.sort(key=lambda r: (-r["buy_score"], -r["exp_return30_net"]))
    else:
        res = [r for r in res if r.get("owned_qty")]
        res.sort(key=lambda r: -r["sell_score"])
    return res[:limit]


def card_detail(conn, card_id):
    card = conn.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
    if not card:
        return None
    res = analyze(conn, card_ids=[card_id], min_price=0)
    hist = db.price_series(conn, card_id)
    sources = [dict(r) for r in conn.execute(
        "SELECT date, source, variant, price, low, avg1, avg7, avg30 FROM prices WHERE card_id=? ORDER BY date DESC LIMIT 20",
        (card_id,))]
    return {"card": dict(card), "analysis": res[0] if res else None, "history": hist, "latest_quotes": sources}
