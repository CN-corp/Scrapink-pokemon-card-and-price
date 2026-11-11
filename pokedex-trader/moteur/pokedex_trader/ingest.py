"""Ingestion des prix.

Source principale : l'API publique pokemontcg.io (v2), qui couvre l'intégralité des cartes
et embarque pour chacune les prix Cardmarket (EUR : trend, avg1, avg7, avg30, low)
et TCGPlayer (USD : market, low, high, par variante). Pas de scraping HTML fragile :
l'API est stable, paginée et gratuite.

Chaque `sync` enregistre un relevé daté : en lançant la synchro chaque jour (cron),
la base construit son propre historique, en plus des moyennes 1/7/30 j de Cardmarket.
"""
import json
import os
import math
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

from . import config, db

PAGE_SIZE = 100  # pages plus petites : l'API renvoie moins d'erreurs 500
SELECT_FIELDS = "id,name,number,rarity,supertype,set,images,tcgplayer,cardmarket"


def _get(path, params=None, retries=6):
    url = f"{config.POKEMONTCG_URL}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"User-Agent": "pokedex-trader/1.0"}
    if config.POKEMONTCG_API_KEY:
        headers["X-Api-Key"] = config.POKEMONTCG_API_KEY
    delay = 2
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            code = getattr(e, "code", None)
            if code in (400, 401, 403, 404) or attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2


def _num(v):
    try:
        f = float(v)
        return f if f > 0 and math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def parse_card(card, today):
    """Transforme une carte de l'API en (ligne carte, [lignes prix])."""
    s = card.get("set") or {}
    images = card.get("images") or {}
    row = {
        "id": card["id"],
        "name": card.get("name"),
        "set_id": s.get("id"),
        "set_name": s.get("name"),
        "number": card.get("number"),
        "rarity": card.get("rarity"),
        "supertype": card.get("supertype"),
        "image_small": images.get("small"),
        "image_large": images.get("large"),
        "release_date": (s.get("releaseDate") or "").replace("/", "-") or None,
        "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
    }
    prices = []
    cmb = card.get("cardmarket") or {}
    cm = cmb.get("prices") or {}
    # Date du relevé = date de mise à jour annoncée (pokemontcg.io sert parfois des prix Cardmarket de plusieurs
    # mois) : un prix ancien ne doit jamais passer pour la cote du jour
    cm_day = (cmb.get("updatedAt") or "")[:10].replace("/", "-") or today
    if cm_day < (date.fromisoformat(today) - timedelta(days=3)).isoformat():
        cm = {}  # bloc Cardmarket périmé : la cote vient de cotes.py (TCGdex), pas d'un vieux relevé
    if cm:
        trend = _num(cm.get("trendPrice")) or _num(cm.get("averageSellPrice"))
        if trend:
            prices.append({
                "card_id": card["id"], "date": cm_day, "source": "cardmarket", "variant": "normal",
                "price": trend, "low": _num(cm.get("lowPrice")), "high": None,
                "avg1": _num(cm.get("avg1")), "avg7": _num(cm.get("avg7")),
                "avg30": _num(cm.get("avg30")), "currency": "EUR",
            })
        rh = _num(cm.get("reverseHoloTrend"))
        if rh:
            prices.append({
                "card_id": card["id"], "date": cm_day, "source": "cardmarket", "variant": "reverseHolo",
                "price": rh, "low": _num(cm.get("reverseHoloLow")), "high": None,
                "avg1": _num(cm.get("reverseHoloAvg1")), "avg7": _num(cm.get("reverseHoloAvg7")),
                "avg30": _num(cm.get("reverseHoloAvg30")), "currency": "EUR",
            })
    tp = (card.get("tcgplayer") or {}).get("prices") or {}
    for variant, p in tp.items():
        market = _num(p.get("market")) or _num(p.get("mid"))
        if not market:
            continue
        # Marché américain, en dollars, tel quel : jamais converti, jamais utilisé comme cote en euros
        prices.append({
            "card_id": card["id"], "date": today, "source": "tcgplayer", "variant": variant,
            "price": market, "low": _num(p.get("low")) or None, "high": _num(p.get("high")) or None,
            "avg1": None, "avg7": None, "avg30": None, "currency": "USD",
        })
    return row, prices


def store(conn, card_rows, price_rows):
    conn.executemany(
        """INSERT INTO cards (id,name,set_id,set_name,number,rarity,supertype,image_small,image_large,release_date,updated_at)
           VALUES (:id,:name,:set_id,:set_name,:number,:rarity,:supertype,:image_small,:image_large,:release_date,:updated_at)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, set_name=excluded.set_name, rarity=excluded.rarity,
             image_small=excluded.image_small, image_large=excluded.image_large, updated_at=excluded.updated_at""",
        card_rows,
    )
    conn.executemany(
        """INSERT OR REPLACE INTO prices (card_id,date,source,variant,price,low,high,avg1,avg7,avg30,currency)
           VALUES (:card_id,:date,:source,:variant,:price,:low,:high,:avg1,:avg7,:avg30,:currency)""",
        price_rows,
    )


def _filter_prices(conn, rows, prices, today):
    """Met à jour la dernière cote de chaque carte ; ne garde l'historique que des cartes
    à partir de HISTORY_MIN_PRICE ou présentes dans le Pokédex."""
    by_card = {}
    for p in prices:
        by_card.setdefault(p["card_id"], []).append(p)
    owned = {r[0] for r in conn.execute("SELECT DISTINCT card_id FROM transactions")}
    kept, last = [], []
    for r in rows:
        ps = by_card.get(r["id"], [])
        if not ps:
            continue
        # La cote est la cote Cardmarket (euros) ; sans elle, la carte n'a pas de cote (pas de repli TCGplayer)
        cm = [p for p in ps if p["source"] == "cardmarket" and p["variant"] == "normal"]
        if cm:
            last.append((cm[0]["price"], cm[0]["date"], r["id"], cm[0]["date"]))
        # Seuil de conservation de l'historique (chaque marché dans sa devise : simple ordre de grandeur)
        if max(p["price"] for p in ps) >= config.HISTORY_MIN_PRICE or r["id"] in owned:
            kept.extend(ps)
    conn.executemany("UPDATE cards SET last_price=?, last_price_date=? WHERE id=? "
                     "AND (last_price_date IS NULL OR last_price_date <= ?)", last)
    return kept


def _prune_history(conn):
    """Supprime l'historique TCGplayer des cartes passées sous le seuil (hors Pokédex). L'historique Cardmarket
    est gardé pour toutes les cartes (cotes.py)."""
    conn.execute(
        """DELETE FROM prices WHERE source <> 'cardmarket' AND source <> 'manual' AND card_id IN (
             SELECT id FROM cards WHERE last_price IS NOT NULL AND last_price < ?
               AND id NOT IN (SELECT card_id FROM transactions)
               AND id NOT IN (SELECT card_id FROM prices GROUP BY card_id HAVING MAX(price) >= ?))""",
        (config.HISTORY_MIN_PRICE, config.HISTORY_MIN_PRICE))


def _progress_path():
    return os.path.join(os.path.dirname(config.DB_PATH), "sync_progress.json")


def sync(query=None, max_pages=None, log=print, budget=None):
    """Télécharge toutes les cartes (ou celles du filtre `query`, ex. 'set.id:sv8').

    Une page en erreur (l'API renvoie parfois des 500) est réessayée plusieurs fois, puis
    sautée et retentée en fin de synchro : une panne ponctuelle n'arrête plus tout.

    `budget` (secondes) arrête proprement la synchro avant la limite de la session ; la page
    atteinte est notée dans data/sync_progress.json et la synchro suivante (jusqu'au lendemain)
    reprend à cette page au lieu de tout recommencer.
    """
    db.init()
    today = date.today().isoformat()
    started = datetime.utcnow().isoformat(timespec="seconds")
    n_cards = n_prices = 0
    failed = []

    def fetch(conn, page):
        params = {"page": page, "pageSize": PAGE_SIZE, "select": SELECT_FIELDS, "orderBy": "set.releaseDate,number"}
        if query:
            params["q"] = query
        data = _get("cards", params)
        rows, prices = [], []
        for c in data.get("data", []):
            r, p = parse_card(c, today)
            rows.append(r)
            prices.extend(p)
        store(conn, rows, [])
        kept = _filter_prices(conn, rows, prices, today)
        store(conn, [], kept)
        conn.commit()
        return len(rows), len(kept), data.get("totalCount", 0)

    t0 = time.time()
    prog_file = _progress_path()
    start_page = 1
    if not query and not max_pages:
        try:
            with open(prog_file) as f:
                prog = json.load(f)
            recent = prog.get("date", "") >= (date.today() - timedelta(days=1)).isoformat()
            if recent and not prog.get("done"):
                start_page = int(prog.get("next_page", 1))
                log(f"  reprise à la page {start_page}")
        except (OSError, ValueError):
            pass

    def save_progress(next_page, done):
        if query or max_pages:
            return
        with open(prog_file, "w") as f:
            json.dump({"date": today, "next_page": next_page, "done": done}, f)

    stopped = False
    with db.session() as conn:
        total, page, streak = None, start_page, 0
        while True:
            if max_pages and page > max_pages:
                break
            if total is not None and (page - 1) * PAGE_SIZE >= total:
                break
            if budget and page > start_page and time.time() - t0 > budget:
                stopped = True
                log(f"  budget de temps atteint, reprise prévue à la page {page}")
                break
            try:
                n, k, tot = fetch(conn, page)
                total = tot if total is None else total
                n_cards += n
                n_prices += k
                streak = 0
                log(f"  page {page} : {n_cards}/{total} cartes, {n_prices} prix conservés")
                if n == 0:
                    break
            except Exception as e:
                failed.append(page)
                streak += 1
                log(f"  page {page} en erreur ({e}), on continue")
                if streak >= 5:
                    break
                time.sleep(10 * streak)
                if total is None:  # page 1 inconnue : on la retente avant d'avancer
                    failed.remove(page)
                    continue
            page += 1
            save_progress(page, False)
            time.sleep(0.1 if config.POKEMONTCG_API_KEY else 1.0)
        for p in list(failed):  # deuxième chance
            try:
                time.sleep(5)
                n, k, _ = fetch(conn, p)
                n_cards += n
                n_prices += k
                failed.remove(p)
                log(f"  page {p} récupérée")
            except Exception as e:
                log(f"  page {p} toujours en erreur ({e})")
        _prune_history(conn)
        if total is None:
            status, msg = "error", "API injoignable"
        elif stopped:
            status, msg = "partial", f"arrêt au budget de temps, reprise à la page {page}"
        elif failed:
            status, msg = "partial", f"pages non récupérées : {failed}"
        else:
            status, msg = "ok", ""
        if total is not None and not stopped and not failed:
            save_progress(1, True)
        conn.execute(
            "INSERT INTO sync_log (started_at,finished_at,source,cards,prices,status,message) VALUES (?,?,?,?,?,?,?)",
            (started, datetime.utcnow().isoformat(timespec="seconds"), "pokemontcg.io", n_cards, n_prices, status, msg),
        )
    log(f"Synchro {status} : {n_cards} cartes, {n_prices} prix conservés. {msg}")
    return {"cards": n_cards, "prices": n_prices, "status": status, "message": msg}


def add_manual_price(conn, card_id, price, on_date=None):
    """Relevé manuel (ex. prix constaté sur eBay ou en boutique)."""
    conn.execute(
        "INSERT OR REPLACE INTO prices (card_id,date,source,variant,price) VALUES (?,?,?,?,?)",
        (card_id, on_date or date.today().isoformat(), "manual", "normal", price),
    )


# --------------------------------------------------------------------------------------
# Données de démonstration : permet de tester tout l'outil sans accès réseau.
# --------------------------------------------------------------------------------------
DEMO_CARDS = [
    ("sv3pt5-199", "Charizard ex", "151", "Special Illustration Rare", 120),
    ("sv3pt5-205", "Mew ex", "151", "Hyper Rare", 35),
    ("sv3pt5-173", "Bulbasaur", "151", "Illustration Rare", 14),
    ("swsh7-215", "Umbreon VMAX", "Evolving Skies", "Secret Rare", 480),
    ("swsh7-218", "Rayquaza VMAX", "Evolving Skies", "Secret Rare", 260),
    ("swsh7-192", "Sylveon V", "Evolving Skies", "Alternate Art", 70),
    ("sv4pt5-232", "Charizard ex", "Paldean Fates", "Shiny Ultra Rare", 55),
    ("sv4pt5-234", "Mew ex", "Paldean Fates", "Special Illustration Rare", 40),
    ("sv8-238", "Pikachu ex", "Surging Sparks", "Special Illustration Rare", 190),
    ("sv8-247", "Pikachu ex", "Surging Sparks", "Hyper Rare", 95),
    ("swsh12pt5-GG70", "Giratina VSTAR", "Crown Zenith", "Galarian Gallery", 85),
    ("swsh11-186", "Giratina V", "Lost Origin", "Alternate Art", 260),
    ("sv2-269", "Iono", "Paldea Evolved", "Special Illustration Rare", 60),
    ("sv6-211", "Greninja ex", "Twilight Masquerade", "Special Illustration Rare", 140),
    ("base1-4", "Charizard", "Base Set", "Rare Holo", 350),
    ("base1-2", "Blastoise", "Base Set", "Rare Holo", 120),
    ("neo1-9", "Lugia", "Neo Genesis", "Rare Holo", 220),
    ("sv7-170", "Terapagos ex", "Stellar Crown", "Special Illustration Rare", 45),
    ("sv5-172", "Gardevoir ex", "Temporal Forces", "Illustration Rare", 9),
    ("swsh9-186", "Charizard V", "Brilliant Stars", "Alternate Art", 150),
]


def generate_demo(days=400, seed=7, with_transactions=True, log=print):
    db.init()
    rnd = random.Random(seed)
    start = date.today() - timedelta(days=days - 1)
    with db.session() as conn:
        conn.execute("DELETE FROM prices WHERE source='demo'")
        card_rows, price_rows = [], []
        for cid, name, set_name, rarity, base in DEMO_CARDS:
            card_rows.append({
                "id": cid, "name": name, "set_id": cid.split("-")[0], "set_name": set_name,
                "number": cid.split("-")[1], "rarity": rarity, "supertype": "Pokémon",
                "image_small": f"https://images.pokemontcg.io/{cid.split('-')[0]}/{cid.split('-')[1]}.png",
                "image_large": f"https://images.pokemontcg.io/{cid.split('-')[0]}/{cid.split('-')[1]}_hires.png",
                "release_date": None, "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
            })
            drift = rnd.uniform(-0.0012, 0.0022)
            vol = rnd.uniform(0.008, 0.03)
            p = base * rnd.uniform(0.7, 1.1)
            hist = []
            for d in range(days):
                # régimes : de temps en temps un « hype » ou une correction
                if rnd.random() < 0.004:
                    drift = rnd.uniform(-0.004, 0.006)
                p *= math.exp(drift + rnd.gauss(0, vol))
                p = max(p, 0.5)
                hist.append(p)
            for d, price in enumerate(hist):
                avg = lambda n: sum(hist[max(0, d - n + 1): d + 1]) / len(hist[max(0, d - n + 1): d + 1])
                price_rows.append({
                    "card_id": cid, "date": (start + timedelta(days=d)).isoformat(), "source": "demo",
                    "variant": "normal", "price": round(price, 2), "low": round(price * 0.85, 2), "high": None,
                    "avg1": round(avg(1), 2), "avg7": round(avg(7), 2), "avg30": round(avg(30), 2), "currency": "EUR",
                })
        store(conn, card_rows, price_rows)

        if with_transactions:
            conn.execute("DELETE FROM transactions WHERE notes LIKE 'demo%'")
            series = {}
            for r in price_rows:
                series.setdefault(r["card_id"], {})[r["date"]] = r["price"]
            ids = [c[0] for c in DEMO_CARDS]
            txs = []
            for _ in range(14):
                cid = rnd.choice(ids)
                d = start + timedelta(days=rnd.randint(0, days - 60))
                px = series[cid][d.isoformat()]
                qty = rnd.choice([1, 1, 1, 2, 3])
                txs.append((cid, "buy", d.isoformat(), qty, round(px * rnd.uniform(0.88, 1.0), 2), 1.0, "demo"))
                if rnd.random() < 0.45:
                    d2 = d + timedelta(days=rnd.randint(20, 200))
                    if d2 < date.today():
                        px2 = series[cid][d2.isoformat()]
                        fee = round(px2 * config.SELL_FEE_PCT + config.SELL_FIXED_FEE, 2)
                        txs.append((cid, "sell", d2.isoformat(), 1, round(px2 * rnd.uniform(0.95, 1.05), 2), fee, "demo"))
            conn.executemany(
                "INSERT INTO transactions (card_id,side,date,quantity,unit_price,fees,notes) VALUES (?,?,?,?,?,?,?)",
                txs,
            )
    log(f"Démo : {len(DEMO_CARDS)} cartes, {days} jours d'historique, transactions d'exemple créées.")
