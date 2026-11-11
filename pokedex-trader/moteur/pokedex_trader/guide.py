"""Cotes du jour depuis le guide de prix officiel de Cardmarket (un seul fichier, toutes les cartes Pokémon).

Cardmarket publie chaque jour en téléchargement libre son guide de prix (price_guide_6.json, 6 = Pokémon) :
pour chaque produit (idProduct), les prix en euros trend, low, avg, avg1, avg7, avg30 et les mêmes pour la
version reverse/holo. C'est la source que TCGdex relaie, sans les 65 000 requêtes ni les trous de TCGdex.

Tout ou rien : le fichier est téléchargé et vérifié en entier, puis appliqué en une seule transaction. S'il
est illisible, incomplet ou plus ancien que les cotes déjà en base, rien n'est écrit et la cote de la veille
reste affichée avec sa date.

Les cartes sont reliées aux produits par la table cm_map (idProduct relevé par la commande `cotes`). Le
fichier sert donc de source des prix ; TCGdex reste la source du catalogue et du rapprochement.
Les cartes françaises ne reçoivent ce prix (toutes langues) que si config.FR_CARDMARKET est activé.
"""
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from . import config, cotes, db

URL = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json"
UA = {"User-Agent": "pokedex-trader/1.0 (+guide de prix Cardmarket)"}
MIN_PRODUCTS = 20000  # un guide Pokémon plus petit est un fichier tronqué : refusé


def fetch(src=None, retries=4):
    """Le guide de prix, depuis un fichier local ou depuis Cardmarket."""
    if src and not src.startswith("http"):
        with open(src, encoding="utf-8") as f:
            return json.load(f)
    delay = 5
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(src or URL, headers=UA), timeout=180) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError):
            if i == retries - 1:
                raise
        time.sleep(delay)
        delay *= 2


def check(data, min_products=MIN_PRODUCTS):
    """(date du guide, {idProduct: ligne}) ; lève ValueError si le fichier n'est pas un guide complet."""
    if not isinstance(data, dict) or not isinstance(data.get("priceGuides"), list):
        raise ValueError("format inattendu (pas de priceGuides)")
    # Date en UTC, comme le champ `updated` de TCGdex : un même guide garde la même date par les deux chemins
    try:
        created = datetime.fromisoformat(str(data.get("createdAt"))).astimezone(timezone.utc).isoformat()
    except ValueError:
        raise ValueError("date du guide (createdAt) absente ou illisible") from None
    day = cotes._day(created)
    idx = {}
    for g in data["priceGuides"]:
        try:
            idx[int(g["idProduct"])] = g
        except (KeyError, TypeError, ValueError):
            continue
    if len(idx) < min_products:
        raise ValueError(f"guide incomplet : {len(idx)} produits (minimum attendu {min_products})")
    return day, idx, created


def apply(src=None, min_products=MIN_PRODUCTS, log=print):
    db.init()
    t0 = time.time()
    now = datetime.utcnow().isoformat(timespec="seconds")
    stats = {"status": "error", "message": ""}
    with db.session() as conn:
        try:
            day, idx, created = check(fetch(src), min_products)
        except Exception as e:
            stats["message"] = f"guide refusé, rien n'est écrit : {e}"
        else:
            newest = conn.execute("SELECT MAX(date) FROM prices WHERE source='cardmarket'").fetchone()[0]
            if newest and day < newest:
                stats["message"] = f"guide du {day} plus ancien que les cotes en base ({newest}) : rien n'est écrit"
            else:
                owned = {r[0] for r in conn.execute("SELECT DISTINCT card_id FROM transactions")}
                fr = "" if config.FR_CARDMARKET else " AND COALESCE(c.lang,'EN') <> 'FR'"
                links = conn.execute("SELECT m.card_id, m.id_product FROM cm_map m JOIN cards c ON c.id=m.card_id"
                                     " WHERE 1=1" + fr).fetchall()
                prices, absent = [], 0
                for cid, pid in links:
                    g = idx.get(pid)
                    if g is None:
                        absent += 1
                        continue
                    prices.extend(cotes.cm_rows(cid, dict(g, updated=created)))
                written = cotes.write_prices(conn, prices, owned)
                used = {pid for _, pid in links}
                stats = {"status": "ok", "date_du_guide": day, "produits_du_guide": len(idx),
                         "cartes_reliees": len(links), "cartes_cotees": len({p["card_id"] for p in prices}),
                         "cartes_absentes_du_guide": absent, "produits_sans_carte": len(set(idx) - used),
                         "lignes_ecrites": written, "message": ""}
        conn.execute(
            "INSERT INTO sync_log (started_at,finished_at,source,cards,prices,status,message) VALUES (?,?,?,?,?,?,?)",
            (now, datetime.utcnow().isoformat(timespec="seconds"), "cardmarket-guide", stats.get("cartes_cotees", 0),
             stats.get("lignes_ecrites", 0), stats["status"], stats["message"][:2000]))
    stats["secondes"] = int(time.time() - t0)
    log(json.dumps(stats, ensure_ascii=False))
    return stats
