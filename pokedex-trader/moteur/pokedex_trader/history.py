"""Historique des prix TCGplayer via tcgcsv.com.

tcgcsv.com publiait des archives quotidiennes des prix TCGplayer (depuis février 2024), mais les a
retirées en octobre 2026 (« temporarily removed due to rising server costs », HTTP 403) et demande
désormais de passer par les fichiers de prix par extension, sans demander le même fichier plus d'une
fois par 24 h. `history load` relève donc chaque jour, une seule fois, les prix du jour de toutes les
extensions reliées : l'historique TCGplayer se construit jour après jour à partir de là, et sert
aussi à coter les cartes japonaises (catégorie « Pokemon Japan »), absentes de pokemontcg.io.
Si les archives reviennent, `load_day` sait toujours les lire.

Les cartes anglaises sont reliées aux produits TCGplayer par extension (nom, date de sortie,
numéros en commun) puis par numéro de carte : `history map`. Les prix sont en dollars, convertis
en euros ; la série d'analyse les recale sur la cote Cardmarket (voir db.splice).
"""
import json
import os
import re
import shutil
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path

from . import config, db

BASE = "https://tcgcsv.com"
ARCHIVE_START = date(2024, 2, 8)
CATEGORIES = {3: "EN", 85: "JP"}
DAILY_DAYS = 120   # un point par jour sur cette période, un par semaine avant
UA = {"User-Agent": "pokedex-trader/1.0 (+https://tcgcsv.com, merci)"}


def _get(url, retries=4, binary=False):
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            if i == retries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i == retries - 1:
                raise
        time.sleep(2 * (i + 1))


def _results(obj):
    return obj.get("results", []) if isinstance(obj, dict) else (obj or [])


def _norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _set_name(group_name):
    """'SV08: Surging Sparks' -> 'surging sparks' ; 'SWSH01: Sword & Shield Base Set' -> 'sword and shield'."""
    n = re.sub(r"^[A-Za-z0-9 .\-]{1,12}:\s*", "", group_name or "")
    n = _norm(n)
    return re.sub(r"\s+base set$", "", n)


def _num(n):
    n = (n or "").split("/")[0].strip().upper()
    m = re.match(r"^([A-Z]*)0*(\d+)([A-Z]*)$", n)
    return f"{m.group(1)}{int(m.group(2))}{m.group(3)}" if m else n


def _ext(product, key):
    for e in product.get("extendedData") or []:
        if e.get("name") == key:
            return e.get("value")
    return None


def _variant(sub):
    """'Reverse Holofoil' -> 'reverseHolofoil' (mêmes clés que pokemontcg.io)."""
    w = re.sub(r"[^A-Za-z0-9 ]", "", sub or "Normal").split()
    return (w[0].lower() + "".join(x.capitalize() for x in w[1:])) if w else "normal"


def _progress_file():
    return Path(config.DB_PATH).parent / "history_progress.json"


def _load_progress():
    try:
        return json.loads(_progress_file().read_text())
    except (OSError, ValueError):
        return {"done": [], "missing": []}


def _save_progress(p):
    _progress_file().write_text(json.dumps(p))


# ---------------------------------------------------------------- correspondances

def build_map(log=print, sleep=0.2):
    """Relie les cartes aux produits TCGplayer et crée les cartes japonaises."""
    db.init()
    stats = {}
    with db.session() as conn:
        sets = {}
        for r in conn.execute("SELECT id, name, set_id, set_name, number, release_date FROM cards "
                              "WHERE COALESCE(lang,'EN')='EN' AND set_name IS NOT NULL"):
            s = sets.setdefault(r["set_name"], {"date": r["release_date"], "cards": []})
            s["cards"].append((r["id"], _norm(r["name"]), _num(r["number"])))
        for cat, lang in CATEGORIES.items():
            groups = _results(_get(f"{BASE}/tcgplayer/{cat}/groups"))
            log(f"  catégorie {cat} ({lang}) : {len(groups)} extensions")
            prods = {}
            for g in groups:
                try:
                    items = _results(_get(f"{BASE}/tcgplayer/{cat}/{g['groupId']}/products"))
                except Exception as e:
                    log(f"  extension {g.get('name')} : {e}")
                    continue
                prods[g["groupId"]] = [p for p in items if _ext(p, "Number")]
                time.sleep(sleep)
            if lang == "EN":
                stats["EN"] = _match_en(conn, sets, groups, prods, log)
            else:
                stats[lang] = _store_jp(conn, groups, prods)
            conn.commit()
    log(f"Correspondances : {stats}")
    return stats


def _match_en(conn, sets, groups, prods, log):
    by_num = {gid: {} for gid in prods}
    for gid, items in prods.items():
        for p in items:
            by_num[gid].setdefault(_num(_ext(p, "Number")), []).append(p)
    gname = {g["groupId"]: _set_name(g.get("name")) for g in groups}
    gdate = {g["groupId"]: (g.get("publishedOn") or "")[:10] for g in groups}
    mapped = unmatched_sets = 0
    rows = []
    for set_name, s in sets.items():
        key = _set_name(set_name)
        best, best_score = None, 0.0
        for gid in by_num:
            sim = SequenceMatcher(None, key, gname[gid]).ratio()
            close = 0.0
            if s["date"] and gdate[gid]:
                try:
                    dd = abs((date.fromisoformat(s["date"][:10]) - date.fromisoformat(gdate[gid])).days)
                    close = max(0.0, 1 - dd / 60)
                except ValueError:
                    pass
            if sim < 0.45 and close == 0:
                continue
            nums = by_num[gid]
            overlap = sum(1 for _, nm, n in s["cards"]
                          if any(_norm(p.get("name")).startswith(nm.split(" ")[0]) for p in nums.get(n, [])))
            ov = overlap / max(1, len(s["cards"]))
            sc = ov + 0.5 * sim + 0.2 * close
            if sc > best_score:
                best, best_score, best_ov = gid, sc, ov
        if best is None or best_ov < 0.3:
            unmatched_sets += 1
            continue
        for cid, nm, n in s["cards"]:
            cands = by_num[best].get(n, [])
            if not cands:
                continue
            named = [p for p in cands if _norm(p.get("name")).startswith(nm)] or \
                    [p for p in cands if _norm(p.get("name")).startswith(nm.split(" ")[0])]
            p = (named or cands)[0]
            rows.append((cid, p["productId"], 3, best))
            mapped += 1
    conn.execute("DELETE FROM tcg_map WHERE category=3")
    conn.executemany("INSERT OR REPLACE INTO tcg_map (card_id, product_id, category, group_id) VALUES (?,?,?,?)", rows)
    log(f"  EN : {mapped} cartes reliées, {unmatched_sets} extensions sans correspondance")
    return {"cards": mapped, "sets_unmatched": unmatched_sets}


def _store_jp(conn, groups, prods):
    gmeta = {g["groupId"]: g for g in groups}
    now = datetime.utcnow().isoformat(timespec="seconds")
    cards, maps = [], []
    for gid, items in prods.items():
        g = gmeta[gid]
        for p in items:
            pid = p["productId"]
            img = p.get("imageUrl") or ""
            cards.append({"id": f"jp-{pid}", "name": p.get("name"), "set_id": f"jp-{gid}", "set_name": g.get("name"),
                          "number": _ext(p, "Number"), "rarity": _ext(p, "Rarity"), "supertype": None,
                          "image_small": img or None, "image_large": img.replace("_200w", "_in_1000x1000") or None,
                          "release_date": (g.get("publishedOn") or "")[:10] or None, "updated_at": now})
            maps.append((f"jp-{pid}", pid, 85, gid))
    conn.executemany(
        """INSERT INTO cards (id,name,set_id,set_name,number,rarity,supertype,image_small,image_large,release_date,updated_at,lang)
           VALUES (:id,:name,:set_id,:set_name,:number,:rarity,:supertype,:image_small,:image_large,:release_date,:updated_at,'JP')
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, set_name=excluded.set_name, rarity=excluded.rarity,
             image_small=excluded.image_small, image_large=excluded.image_large, lang='JP'""", cards)
    conn.executemany("INSERT OR REPLACE INTO tcg_map (card_id, product_id, category, group_id) VALUES (?,?,?,?)", maps)
    return {"cards": len(cards)}


# ---------------------------------------------------------------- archives

def plan_dates(today=None):
    """Dates à charger, de la plus récente à la plus ancienne."""
    today = today or date.today()
    out, d = [], today - timedelta(days=1)
    while d >= ARCHIVE_START:
        out.append(d)
        d -= timedelta(days=1 if (today - d).days < DAILY_DAYS else 7)
    return [x.isoformat() for x in out]


def _read_archive(path, workdir):
    """Renvoie {(categorie, productId): [(variante, market, low, high), ...]} pour les catégories suivies."""
    import py7zr
    out = {}
    with py7zr.SevenZipFile(path, "r") as z:
        names = [n for n in z.getnames() if re.search(r"/(3|85)/\d+/prices$", n)]
        z.extract(path=workdir, targets=names)
    for n in names:
        cat = int(n.split("/")[-3])
        try:
            data = json.loads((Path(workdir) / n).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for r in _results(data):
            market = r.get("marketPrice") or r.get("midPrice")
            if not market:
                continue
            out.setdefault((cat, r["productId"]), []).append(
                (_variant(r.get("subTypeName")), market, r.get("lowPrice"), r.get("highPrice")))
    return out


def load_day(conn, day, log=print):
    """Télécharge l'archive d'un jour et enregistre les prix des cartes suivies. False si absente."""
    url = f"{BASE}/archive/tcgplayer/prices-{day}.ppmd.7z"
    tmp = Path(tempfile.mkdtemp(prefix="tcgcsv-"))
    try:
        try:
            raw = _get(url, binary=True)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            raise
        arc = tmp / "a.7z"
        arc.write_bytes(raw)
        prices = _read_archive(arc, tmp / "x")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return _store(conn, day, prices, log)


def _store(conn, day, prices, log=print):
    """Enregistre {(categorie, productId): [(variante, market, low, high)]} pour les cartes suivies."""
    by_prod = {}
    for r in conn.execute("SELECT m.card_id, m.product_id, m.category, c.last_price, COALESCE(c.lang,'EN') lang "
                          "FROM tcg_map m JOIN cards c ON c.id = m.card_id"):
        by_prod.setdefault((r["category"], r["product_id"]), []).append(dict(r))
    owned = {r[0] for r in conn.execute("SELECT DISTINCT card_id FROM transactions")}
    # Prix du marché américain (TCGplayer), gardés en dollars : jamais convertis, jamais pris comme cote en euros
    # d'une carte anglaise ou japonaise (cards.last_price reste la cote Cardmarket, ou vide)
    rows = []
    for key, vals in prices.items():
        for c in by_prod.get(key, []):
            ref = max(v[1] for v in vals)
            keep = c["card_id"] in owned or ref >= config.HISTORY_MIN_PRICE or \
                (c["last_price"] or 0) >= config.HISTORY_MIN_PRICE
            if not keep:
                continue
            for var, m, lo, hi in vals:
                rows.append((c["card_id"], day, "tcghist", var, m, lo or None, hi or None))
    conn.executemany("""INSERT OR REPLACE INTO prices (card_id,date,source,variant,price,low,high,currency)
                        VALUES (?,?,?,?,?,?,?,'USD')""", rows)
    conn.commit()
    log(f"  {day} : {len(rows)} prix")
    return True


def _parse_prices(cat, data, out):
    for r in _results(data):
        market = r.get("marketPrice") or r.get("midPrice")
        if market and r.get("productId"):
            out.setdefault((cat, r["productId"]), []).append(
                (_variant(r.get("subTypeName")), market, r.get("lowPrice"), r.get("highPrice")))


def backfill(budget=None, log=print, today=None, sleep=0.2):
    """Relève les prix TCGplayer du jour, extension par extension, une seule fois par jour
    (demande de tcgcsv.com). Reprend les extensions restantes si le budget a coupé la relève."""
    db.init()
    t0 = time.time()
    day = (today or date.today()).isoformat()
    prog = _load_progress()
    if prog.get("date") != day:
        prog = {"date": day, "groups_done": [], "days": prog.get("days", [])}
    done = set(prog.get("groups_done", []))
    with db.session() as conn:
        groups = [(r[0], r[1]) for r in conn.execute(
            "SELECT DISTINCT category, group_id FROM tcg_map WHERE group_id IS NOT NULL ORDER BY category, group_id")]
        if not groups:
            log("Aucune correspondance TCGplayer : lancez d'abord `history map`.")
            return {"status": "error", "loaded": 0, "remaining": None}
        prices, fetched, errors = {}, [], 0
        for cat, gid in groups:
            key = f"{cat}/{gid}"
            if key in done:
                continue
            if budget and time.time() - t0 > budget:
                break
            try:
                _parse_prices(cat, _get(f"{BASE}/tcgplayer/{cat}/{gid}/prices"), prices)
                fetched.append(key)
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    fetched.append(key)
                else:
                    errors += 1
                    log(f"  {key} : HTTP {e.code}")
            except Exception as e:
                errors += 1
                log(f"  {key} : {e}")
            time.sleep(sleep)
        _store(conn, day, prices, log)
        done.update(fetched)
        remaining = len([g for g in groups if f"{g[0]}/{g[1]}" not in done])
        if remaining == 0 and day not in prog["days"]:
            prog["days"].append(day)
        prog["groups_done"] = sorted(done)
        _save_progress(prog)
        pruned = conn.execute("""DELETE FROM prices WHERE source='tcghist' AND card_id IN (
                 SELECT id FROM cards WHERE last_price IS NOT NULL AND last_price < ?
                   AND id NOT IN (SELECT card_id FROM transactions))
                 AND card_id NOT IN (SELECT card_id FROM prices WHERE source='tcghist' GROUP BY card_id HAVING MAX(price) >= ?)""",
                                (config.HISTORY_MIN_PRICE, config.HISTORY_MIN_PRICE))
    status = "ok" if remaining == 0 else "partial"
    log(f"Relevé TCGplayer du {day} {status} : {len(fetched)} extensions lues, {remaining} restantes, {errors} erreurs.")
    return {"status": status, "groups": len(fetched), "remaining": remaining, "errors": errors,
            "days": len(prog["days"]), "pruned": pruned.rowcount}
