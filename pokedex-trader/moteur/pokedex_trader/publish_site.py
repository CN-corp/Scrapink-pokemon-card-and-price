"""Publication des données vers le site public (Supabase, API PostgREST).

    python3 -m pokedex_trader publish-site

Envoie, par lots de 500 lignes (upsert) :
  - sets            extensions (déduites des cartes si la table locale est vide)
  - cards           catalogue public : toutes les cartes avec leur dernière cote
  - analysis        signaux, scores, estimations (données Pro, protégées par RLS)
  - price_history   historique récent des cartes suivies (>= 50 €, ou suivies par un membre du site)
puis enregistre la performance du jour de chaque portefeuille (snapshot_portfolios)
et écrit une ligne dans sync_runs.

Variables d'environnement : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (clé « service_role »,
à ne JAMAIS mettre dans le site). Si elles manquent, le script l'indique et s'arrête sans erreur
(code 0) : la synchro quotidienne continue normalement.

L'analyse publiée est « neutre » : elle ne tient pas compte du Pokédex local (positions,
objectifs), qui reste privé. La base locale est ouverte en lecture seule.
Bibliothèque standard uniquement.
"""
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

from . import analysis, config

BATCH = 500
UA = "pokedex-trader-publish/1.0"


# ---------------------------------------------------------------- base locale (lecture seule)
def connect_ro(path=None):
    path = path or config.DB_PATH
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _iso_date(s):
    s = (s or "").strip().replace("/", "-")[:10]
    try:
        return date.fromisoformat(s).isoformat()
    except ValueError:
        return None


def _clean(v):
    return None if v in (None, "", "None", "null") else v


def norm_text(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


_EN_SERIES = [
    ("me", "Méga-Évolution"), ("rsv", "Écarlate et Violet"), ("zsv", "Écarlate et Violet"), ("sv", "Écarlate et Violet"),
    ("swsh", "Épée et Bouclier"), ("cel25", "Épée et Bouclier"), ("pgo", "Épée et Bouclier"), ("fut", "Épée et Bouclier"),
    ("sma", "Soleil et Lune"), ("sm", "Soleil et Lune"), ("det", "Soleil et Lune"), ("xy", "XY"), ("g1", "XY"), ("dc", "XY"),
    ("bw", "Noir et Blanc"), ("dv", "Noir et Blanc"), ("mcd", "McDonald's"), ("hgss", "HeartGold SoulSilver"),
    ("col", "HeartGold SoulSilver"), ("pl", "Platine"), ("dp", "Diamant et Perle"), ("ru", "Platine"),
    ("ex", "EX"), ("pop", "POP"), ("np", "Promos Nintendo"), ("ecard", "e-Card"), ("neo", "Neo"), ("gym", "Gym"),
    ("base", "Base"), ("bp", "Base"), ("lc", "Base"), ("si", "Base"), ("tk", "Kits dresseur"),
]
_JP_SERIES = [
    (r"^(M\d|ME|MF|MC)", "Méga-Évolution (JP)"), (r"^SV", "Écarlate et Violet (JP)"), (r"^S\d|^S[A-Z]", "Épée et Bouclier (JP)"),
    (r"^SM", "Soleil et Lune (JP)"), (r"^(XY|CP)", "XY (JP)"), (r"^BW", "Noir et Blanc (JP)"),
]


def series_of(set_id, set_name, lang):
    sid = (set_id or "").lower()
    if lang == "JP":
        code = (set_name or "").split(":")[0].strip().upper()
        for rx, label in _JP_SERIES:
            if re.match(rx, code):
                return label
        return "Japon : autres"
    for prefix, label in _EN_SERIES:
        if sid.startswith(prefix):
            return label
    return "Autres"


_VARIANT_MAP = {"normal": "normal", "unlimited": "normal", "1stedition": "first", "holofoil": "holo",
                "unlimitedholofoil": "holo", "1steditionholofoil": "first", "reverseholofoil": "reverse",
                "reverseholo": "reverse"}
_ULTRA = re.compile(r"ultra|secret|rainbow|illustration|hyper|double|shiny|vmax|vstar|\bv\b|gx|ex\b|ace spec|prism|"
                    r"break|lv\.x|star|legend|prime|radiant|amazing|trainer gallery|promo", re.I)


def guess_variants(rarity, lang, seen=None, released=None):
    """Variantes d'impression d'une carte (mode « master set ») : relevées dans les prix si on
    en a, sinon déduites de la rareté (Commune / Peu commune / Rare : normale + reverse ;
    Rare Holo : holo + reverse ; raretés spéciales : holo seule ; pas de reverse avant 2002)."""
    if seen:
        out = sorted({_VARIANT_MAP[v] for v in seen if v in _VARIANT_MAP},
                     key=["normal", "first", "holo", "reverse"].index)
        if out:
            return out
    r = rarity or ""
    if lang == "JP":
        return ["normal"]
    if released and released < "2002-09-01":
        return ["holo"] if "holo" in r.lower() or _ULTRA.search(r) else ["normal"]
    if _ULTRA.search(r):
        return ["holo"]
    if "holo" in r.lower():
        return ["holo", "reverse"]
    if r in ("Common", "Uncommon", "Rare"):
        return ["normal", "reverse"]
    return ["normal"]


def collect_cards(conn):
    """Catalogue : toutes les cartes (les japonaises seulement si elles ont une cote)."""
    seen = {}
    # Variantes d'impression : TCGplayer les distingue ; chez Cardmarket « normal » n'est que la cote de base
    for r in conn.execute("""SELECT DISTINCT card_id, lower(variant) v FROM prices WHERE variant IS NOT NULL
                              AND NOT (source IN ('cardmarket', 'manual', 'demo') AND variant = 'normal')"""):
        seen.setdefault(r["card_id"], set()).add(r["v"])
    latest = {}
    for r in conn.execute(
            """SELECT card_id, date, price FROM prices
               WHERE variant='normal' AND source IN ('cardmarket','manual') AND price IS NOT NULL
               ORDER BY card_id, date, CASE source WHEN 'cardmarket' THEN 1 ELSE 0 END"""):
        latest[r["card_id"]] = (r["price"], r["date"])  # dernier relevé ; à date égale Cardmarket l'emporte
    manual = {}
    for r in conn.execute("SELECT card_id, date, price FROM prices WHERE source='manual' AND price IS NOT NULL ORDER BY date"):
        manual[r["card_id"]] = (r["price"], r["date"])
    rows = list(conn.execute("SELECT * FROM cards"))
    # Cartes japonaises publiées : celles suivies sur leur marché (relevés TCGplayer en dollars), même sans cote en euros
    jp_tracked = {r[0] for r in conn.execute("SELECT DISTINCT card_id FROM prices WHERE source IN ('tcgplayer', 'tcghist')")}
    base = {}
    for r in rows:
        p = latest.get(r["id"]) or ((r["last_price"], r["last_price_date"]) if r["last_price"] else (None, None))
        base[r["id"]] = p
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = []
    for r in rows:
        lang = r["lang"] or "EN"
        ref = r["ref_id"] if "ref_id" in r.keys() else None
        price, pdate = base[r["id"]]
        if lang == "FR":
            # Carte française : ses propres prix français saisis, ou la cote Cardmarket relevée sur son propre produit
            # (toutes langues confondues) si config.FR_CARDMARKET ; jamais la cote de la carte anglaise
            own_cm = latest.get(r["id"]) if config.FR_CARDMARKET else None
            price, pdate = manual.get(r["id"]) or own_cm or (None, None)
        if lang == "JP" and r["id"] not in jp_tracked and not price:
            continue
        rarity = _clean(r["rarity"])
        out.append({
            "id": r["id"], "name": r["name"], "set_id": r["set_id"], "set_name": r["set_name"],
            "number": _clean(r["number"]), "rarity": rarity, "lang": lang,
            "image_small": _clean(r["image_small"]), "image_large": _clean(r["image_large"]),
            "release_date": _iso_date(r["release_date"]),
            "price": round(price, 2) if price else None, "price_date": _iso_date(pdate),
            "ref_id": ref, "variants": guess_variants(rarity, lang, seen.get(ref or r["id"]), _iso_date(r["release_date"])),
            "search": norm_text(f"{r['name']} {r['set_name'] or ''} {r['number'] or ''} {r['id']}"),
            "updated_at": now,
        })
    return out


def collect_sets(conn, cards):
    """Extensions : table locale si elle est remplie, complétée par celles déduites des cartes."""
    local = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM sets")}
    groups = {}
    ref_set = {c["id"]: c["set_id"] for c in cards if c["lang"] == "EN"}
    for c in cards:
        if not c["set_id"]:
            continue
        g = groups.setdefault(c["set_id"], {"name": c["set_name"] or c["set_id"], "dates": [], "n": 0, "langs": {}, "ref": None})
        g["n"] += 1
        g["langs"][c["lang"]] = g["langs"].get(c["lang"], 0) + 1
        if c["release_date"]:
            g["dates"].append(c["release_date"])
        if c["ref_id"] and not g["ref"]:
            g["ref"] = ref_set.get(c["ref_id"])
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = []
    for sid, g in groups.items():
        lang = max(g["langs"], key=g["langs"].get)
        loc = local.get(sid, {})
        series = loc.get("series") or series_of(g["ref"] or sid, g["name"], lang)
        out.append({
            "id": sid, "name": loc.get("name") or g["name"], "series": series,
            "release_date": _iso_date(loc.get("release_date")) or (min(g["dates"]) if g["dates"] else None),
            "total": g["n"], "lang": lang,
            "logo": f"https://images.pokemontcg.io/{sid}/logo.png" if lang == "EN" else None,
            "updated_at": now,
        })
    return out


def neutral_analysis(conn, min_price=3.0):
    """Même calcul que analysis.analyze(), sans les ajustements liés au Pokédex local."""
    series, snaps, tcg = analysis._load_market(conn)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = []
    for cid, by_date in series.items():
        prices = analysis._daily(by_date)
        if not prices or prices[-1] < min_price:
            continue
        snap = snaps.get(cid)
        cm = snap["price"] if snap else None
        other = tcg[cid][1] if cm and cid in tcg else None
        ind = analysis.indicators(prices, snap, other)
        b, s, why_b, why_s = analysis.score(ind)
        conf = analysis.confidence(ind, snap)
        rng = ind.get("est30_range") or [None, None]
        f = lambda k: (round(ind[k], 4) if isinstance(ind.get(k), float) else ind.get(k))
        out.append({
            "card_id": cid, "signal": analysis.label(b, s, False), "buy_score": b, "sell_score": s,
            "confidence": conf, "rank_buy": round(b * (0.6 + 0.4 * conf / 100), 1),
            "rank_sell": round(s * (0.6 + 0.4 * conf / 100), 1), "price": ind["price"],
            "mom7": f("mom7"), "mom30": f("mom30"), "mom90": f("mom90"), "mom365": f("mom365"),
            "trend_year": f("trend_year"), "est30": ind.get("est30"), "est90": ind.get("est90"),
            "est30_low": rng[0], "est30_high": rng[1], "exp_return30_net": f("exp_return30_net"),
            "vol30": f("vol30"), "rsi": f("rsi"), "ath_365": round(ind["ath_365"], 2) if ind.get("ath_365") else None,
            "other_market": round(other, 2) if other else None, "history_days": ind.get("history_days"),
            "reasons_buy": why_b[:6], "reasons_sell": why_s[:6], "updated_at": now,
        })
    return out, series


def collect_history(series, card_ids, since):
    rows = []
    for cid in sorted(card_ids):
        for d, (src, p) in sorted((series.get(cid) or {}).items()):
            if d >= since and p:
                rows.append({"card_id": cid, "date": d, "price": round(p, 2), "source": src or "cardmarket"})
    return rows


# ---------------------------------------------------------------- API PostgREST
class Rest:
    def __init__(self, url, key, log=print):
        self.base = url.rstrip("/") + "/rest/v1"
        self.key = key
        self.log = log

    def call(self, method, path, body=None, prefer=None, retries=4):
        data = None if body is None else json.dumps(body, ensure_ascii=False, default=str).encode("utf-8")
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "User-Agent": UA,
                   "Content-Type": "application/json", "Accept": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        for i in range(retries):
            req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    raw = r.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")[:500]
                if e.code in (429, 500, 502, 503, 504) and i < retries - 1:
                    time.sleep(3 * (i + 1))
                    continue
                raise RuntimeError(f"{method} {path.split('?')[0]} : HTTP {e.code} {detail}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if i < retries - 1:
                    time.sleep(3 * (i + 1))
                    continue
                raise RuntimeError(f"{method} {path.split('?')[0]} : {e}") from None

    def upsert(self, table, rows, on_conflict, label=None):
        n = 0
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            self.call("POST", f"/{table}?on_conflict={on_conflict}", chunk,
                      prefer="resolution=merge-duplicates,return=minimal")
            n += len(chunk)
            if (i // BATCH) % 20 == 19:
                self.log(f"  {label or table} : {n} / {len(rows)}")
        self.log(f"  {label or table} : {n} ligne(s) envoyée(s)")
        return n


def _since(days):
    return (date.today() - timedelta(days=days)).isoformat()


def publish(rest, conn, history_days=None, log=print):
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    run = rest.call("POST", "/sync_runs", {"status": "running", "started_at": started,
                                           "notes": "publish-site"}, prefer="return=representation")
    run_id = run[0]["id"] if run else None
    stats = {"cards": 0, "analysis": 0, "history": 0}
    try:
        cards = collect_cards(conn)
        sets = collect_sets(conn, cards)
        log(f"{len(sets)} extensions, {len(cards)} cartes")
        rest.upsert("sets", sets, "id")
        stats["cards"] = rest.upsert("cards", cards, "id")
        known = {c["id"] for c in cards}

        rows, series = neutral_analysis(conn)
        rows = [r for r in rows if r["card_id"] in known]
        stats["analysis"] = rest.upsert("analysis", rows, "card_id")
        # Cartes qui ne sont plus analysées (cote passée sous le seuil…) : on retire leur ancienne analyse
        rest.call("DELETE", f"/analysis?updated_at=lt.{urllib.request.quote(started)}", prefer="return=minimal")

        tracked = {r["card_id"] for r in rows if (r["price"] or 0) >= config.HISTORY_MIN_PRICE}
        try:
            tracked |= {r["card_id"] for r in (rest.call("POST", "/rpc/site_tracked_cards", {}) or [])}
        except RuntimeError as e:
            log(f"  cartes suivies par les membres indisponibles : {e}")
        tracked &= known
        if history_days is None:
            last = rest.call("GET", "/price_history?select=date&order=date.desc&limit=1") or []
            history_days = 30 if last else 365  # premier envoi : un an d'historique
        hist = collect_history(series, tracked, _since(history_days))
        stats["history"] = rest.upsert("price_history", hist, "card_id,date,source", label=f"price_history ({history_days} j)")
        try:
            n = rest.call("POST", "/rpc/check_price_alerts", {})
            log(f"  alertes de prix déclenchées : {n}")
        except RuntimeError as e:
            log(f"  vérification des alertes impossible : {e}")
        try:
            n = rest.call("POST", "/rpc/snapshot_portfolios", {})
            log(f"  performances des portefeuilles enregistrées : {n}")
        except RuntimeError as e:
            log(f"  performances des portefeuilles non enregistrées : {e}")
        status, notes = "ok", f"{len(sets)} extensions, {len(tracked)} cartes suivies"
    except Exception as e:
        status, notes = "error", str(e)[:900]
        log(f"Erreur : {e}")
    if run_id is not None:
        try:
            rest.call("PATCH", f"/sync_runs?id=eq.{run_id}",
                      {"status": status, "finished_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                       "cards": stats["cards"], "analysis": stats["analysis"], "history": stats["history"],
                       "notes": notes}, prefer="return=minimal")
        except RuntimeError as e:
            log(f"  sync_runs non mis à jour : {e}")
    log(f"Publication {status} : {stats['cards']} cartes, {stats['analysis']} analyses, {stats['history']} points d'historique.")
    return status, stats


def main(history_days=None, dry_run=False, log=print):
    if dry_run:
        conn = connect_ro()
        try:
            cards = collect_cards(conn)
            sets = collect_sets(conn, cards)
            rows, series = neutral_analysis(conn)
            tracked = {r["card_id"] for r in rows if (r["price"] or 0) >= config.HISTORY_MIN_PRICE}
            hist = collect_history(series, tracked, _since(history_days or 365))
        finally:
            conn.close()
        log(f"Simulation : {len(sets)} extensions, {len(cards)} cartes, {len(rows)} analyses, "
            f"{len(hist)} points d'historique ({len(tracked)} cartes suivies). Rien n'a été envoyé.")
        return 0
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        log("publish-site : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY ne sont pas définies, publication du site ignorée.")
        log("  (Pour l'activer : ajoutez ces deux variables à l'environnement, voir site/README.md.)")
        return 0
    conn = connect_ro()
    try:
        status, _ = publish(Rest(url, key, log), conn, history_days=history_days, log=log)
    except RuntimeError as e:  # création de la ligne sync_runs impossible (URL ou clé erronée…)
        log(f"publish-site : publication impossible : {e}")
        return 1
    finally:
        conn.close()
    return 0 if status == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
