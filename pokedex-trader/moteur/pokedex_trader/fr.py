"""Cartes françaises : catalogue TCGdex (noms, extensions et illustrations en français).

Le marché français a ses propres prix : une carte française ne reprend jamais la cote de la carte
anglaise. Chaque carte française (id « fr-<id TCGdex> ») est reliée à la même carte du catalogue anglais
(colonne cards.ref_id) seulement pour sa rareté et ses variantes ; sa cote vient uniquement de prix
français (source 'manual' sur la carte FR, en attendant une source de prix française). Sans eux, pas de cote.
"""
import json
import re
import time
import urllib.error
import urllib.request
from datetime import date, datetime

from . import db

BASE = "https://api.tcgdex.net/v2/fr"
UA = {"User-Agent": "pokedex-trader/1.0"}


def _get(url, retries=4):
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404 or i == retries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i == retries - 1:
                raise
        time.sleep(2 * (i + 1))


def _num(n):
    n = (n or "").strip().upper()
    m = re.match(r"^([A-Z]*)0*(\d+)([A-Z]*)$", n)
    return f"{m.group(1)}{int(m.group(2))}{m.group(3)}" if m else n


def _norm_id(s):
    """'sv01' -> 'sv1', 'swsh3.5' -> 'swsh35' : rapproche les codes d'extension TCGdex de pokemontcg.io."""
    s = (s or "").lower().replace(".", "")
    return re.sub(r"(?<=[a-z])0+(?=\d)", "", s)


def build(log=print, sleep=0.15):
    """Crée ou met à jour les cartes françaises et leur lien vers la carte anglaise."""
    db.init()
    sets = _get(f"{BASE}/sets")
    log(f"  {len(sets)} extensions françaises")
    now = datetime.utcnow().isoformat(timespec="seconds")
    made = unmatched = 0
    with db.session() as conn:
        en = {}
        for r in conn.execute("SELECT id, set_id, number, release_date FROM cards WHERE COALESCE(lang,'EN')='EN' AND set_id IS NOT NULL"):
            s = en.setdefault(r["set_id"], {"date": r["release_date"], "nums": {}})
            s["nums"][_num(r["number"])] = r["id"]
        by_norm = {_norm_id(k): k for k in en}
        rows = []
        for st in sets:
            try:
                full = _get(f"{BASE}/sets/{st['id']}")
            except Exception as e:
                log(f"  extension {st.get('id')} : {e}")
                continue
            time.sleep(sleep)
            cards = full.get("cards") or []
            nums = {_num(c.get("localId")) for c in cards}
            target = by_norm.get(_norm_id(st["id"]))
            if not target:
                # Même date de sortie (à 5 jours près) et le plus de numéros en commun
                rd = (full.get("releaseDate") or "")[:10]
                best, best_ov = None, 0
                for sid, s in en.items():
                    try:
                        if not rd or not s["date"] or abs((date.fromisoformat(rd) - date.fromisoformat(s["date"][:10])).days) > 5:
                            continue
                    except ValueError:
                        continue
                    ov = len(nums & set(s["nums"]))
                    if ov > best_ov:
                        best, best_ov = sid, ov
                target = best if best_ov >= max(3, len(nums) // 3) else None
            if not target:
                unmatched += 1
                continue
            for c in cards:
                ref = en[target]["nums"].get(_num(c.get("localId")))
                if not ref:
                    continue
                img = c.get("image")
                rows.append({"id": f"fr-{c['id']}", "name": c.get("name"), "set_id": f"fr-{st['id']}",
                             "set_name": full.get("name") or st.get("name"), "number": c.get("localId"),
                             "image_small": f"{img}/low.webp" if img else None,
                             "image_large": f"{img}/high.webp" if img else None,
                             "release_date": (full.get("releaseDate") or "")[:10] or en[target]["date"],
                             "updated_at": now, "ref_id": ref})
                made += 1
        conn.executemany(
            """INSERT INTO cards (id,name,set_id,set_name,number,rarity,image_small,image_large,release_date,updated_at,lang,ref_id)
               VALUES (:id,:name,:set_id,:set_name,:number,(SELECT rarity FROM cards WHERE id=:ref_id),:image_small,:image_large,
                       :release_date,:updated_at,'FR',:ref_id)
               ON CONFLICT(id) DO UPDATE SET name=excluded.name, set_name=excluded.set_name,
                 image_small=COALESCE(excluded.image_small, cards.image_small),
                 image_large=COALESCE(excluded.image_large, cards.image_large), ref_id=excluded.ref_id, lang='FR'""", rows)
        db.refresh_fr_prices(conn)
    log(f"Cartes françaises : {made} reliées, {unmatched} extensions sans équivalent anglais.")
    return {"cards": made, "sets_unmatched": unmatched}
