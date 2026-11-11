"""Cotes quotidiennes Cardmarket (euros) et catalogue complet, via l'API publique TCGdex.

TCGdex (api.tcgdex.net) relaie chaque jour le guide de prix officiel de Cardmarket : pour chaque carte,
le numéro de produit Cardmarket (idProduct) et ses prix en euros (trend, low, avg, avg1, avg7, avg30, et les
mêmes pour la version reverse/holo). Rien n'est converti : ce sont des prix Cardmarket, en euros.

- Cartes anglaises (en) : reliées aux cartes existantes (produit TCGplayer, sinon extension + numéro) ;
  les cartes absentes de la base sont créées (id « en-<id TCGdex> »).
- Cartes japonaises (ja) : Cardmarket vend les cartes japonaises comme des produits distincts, la cote est
  donc celle du marché japonais sur Cardmarket. Reliées aux cartes « jp-<produit TCGplayer> » existantes,
  sinon créées (id « ja-<id TCGdex> »).
- Cartes françaises (fr) : le catalogue est complété (id « fr-<id TCGdex> »). Sur Cardmarket, la carte
  française et l'anglaise sont un seul et même produit (cote toutes langues confondues) : ce prix n'est
  enregistré sur les cartes françaises que si config.FR_CARDMARKET est activé, et il est alors présenté
  comme « Cardmarket · toutes langues ».

La date d'un relevé est la date de mise à jour annoncée par Cardmarket, jamais la date du jour : un prix
ancien ne passe jamais pour un prix frais.

Historique : toutes les cartes gardent leur historique. Pour limiter la taille de la base, une carte sous
DAILY_MIN_PRICE n'a une nouvelle ligne que les jours où son prix change (sa cote reste celle de la dernière
ligne) ; les autres, et celles du Pokédex, ont une ligne par jour.
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

from . import config, db

BASE = "https://api.tcgdex.net/v2"
UA = {"User-Agent": "pokedex-trader/1.0 (+cotes quotidiennes)"}
LANG_CODE = {"en": "EN", "ja": "JP", "fr": "FR"}


def _get(url, retries=5):
    delay = 2
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404 or i == retries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError):
            if i == retries - 1:
                raise
        time.sleep(delay)
        delay *= 2


def _url(lang, *parts):
    return f"{BASE}/{lang}/" + "/".join(urllib.parse.quote(p, safe="") for p in parts)


def _num(n):
    """'077/092' -> '77', 'TG01' -> 'TG1', 'SV001' -> 'SV1'."""
    n = (n or "").split("/")[0].strip().upper()
    m = re.match(r"^([A-Z]*)0*(\d+)([A-Z]*)$", n)
    return f"{m.group(1)}{int(m.group(2))}{m.group(3)}" if m else n


def _norm_id(s):
    """'sv01' -> 'sv1', 'swsh3.5' -> 'swsh35' : rapproche les codes d'extension TCGdex de pokemontcg.io."""
    s = (s or "").lower().replace(".", "")
    return re.sub(r"(?<=[a-z])0+(?=\d)", "", s)


def _norm_name(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _pos(v):
    try:
        f = float(v)
        return round(f, 2) if f > 0 else None
    except (TypeError, ValueError):
        return None


def _day(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).date().isoformat()
    except (AttributeError, ValueError):
        return None


def cm_rows(card_id, cm):
    """Lignes de prix (variante normale et reverse/holo) d'un bloc pricing.cardmarket de TCGdex."""
    if not cm or (cm.get("unit") or "EUR") != "EUR":
        return []
    day = _day(cm.get("updated"))
    if not day:
        return []
    out = []
    for var, sfx in (("normal", ""), ("reverseHolo", "-holo")):
        price = _pos(cm.get("trend" + sfx)) or _pos(cm.get("avg" + sfx))
        if price:
            out.append({"card_id": card_id, "date": day, "source": "cardmarket", "variant": var, "price": price,
                        "low": _pos(cm.get("low" + sfx)), "high": None, "avg1": _pos(cm.get("avg1" + sfx)),
                        "avg7": _pos(cm.get("avg7" + sfx)), "avg30": _pos(cm.get("avg30" + sfx)), "currency": "EUR"})
    return out


def _tcg_ids(card):
    ids = set()
    for v in card.get("variants_detailed") or []:
        t = (v.get("thirdParty") or {}).get("tcgplayer")
        if t:
            ids.add(int(t))
    tp = (card.get("pricing") or {}).get("tcgplayer") or {}
    for v in tp.values():
        if isinstance(v, dict) and v.get("productId"):
            ids.add(int(v["productId"]))
    return ids


class Matcher:
    """Retrouve, pour une carte TCGdex, la carte déjà en base (ou l'id à créer)."""

    def __init__(self, conn, lang):
        self.lang = lang
        self.taken = set()
        code = LANG_CODE[lang]
        self.by_product = {}
        cat = {"en": 3, "ja": 85}.get(lang)
        if cat:
            for r in conn.execute("SELECT card_id, product_id FROM tcg_map WHERE category=?", (cat,)):
                self.by_product[r[1]] = r[0]
        self.sets = {}  # set_id -> {"date", "nums": {num: card_id}}
        for r in conn.execute("SELECT id, set_id, set_name, number, release_date FROM cards WHERE COALESCE(lang,'EN')=?",
                              (code,)):
            if not r["set_id"]:
                continue
            s = self.sets.setdefault(r["set_id"], {"date": r["release_date"], "name": r["set_name"], "nums": {}})
            s["nums"].setdefault(_num(r["number"]), r["id"])
        self.by_norm = {}
        names = {}
        for sid, s in self.sets.items():
            names.setdefault(_norm_name(s["name"]), set()).add(sid)
        self.by_name = {k: next(iter(v)) for k, v in names.items() if k and len(v) == 1}
        for sid, s in self.sets.items():
            if lang == "ja":  # « SV3: Ruler of the Black Flame » -> code « sv3 »
                m = re.match(r"^([A-Za-z0-9-]+)(?::|\s+Promo)", s["name"] or "")
                if m:
                    self.by_norm.setdefault(_norm_id(m.group(1)), sid)
            else:
                self.by_norm.setdefault(_norm_id(sid), sid)

    def target_set(self, set_id, release, nums, name=None):
        if self.lang == "fr":
            return None
        t = self.by_norm.get(_norm_id(set_id))
        if not t and name and self.lang == "en":
            t = self.by_name.get(_norm_name(name))
        if t:
            return t
        if not release or set_id.startswith("tk-"):
            return None  # kits d'entraînement : jamais rapprochés d'une autre extension par la date
        best, best_ov = None, 0
        for sid, s in self.sets.items():
            if sid.startswith(("en-", "ja-")):
                continue
            try:
                if not s["date"] or abs((date.fromisoformat(release) - date.fromisoformat(s["date"][:10])).days) > 5:
                    continue
            except ValueError:
                continue
            # Taille comparable : un kit de 30 cartes sorti le même jour qu'une grande extension n'est pas elle
            if not (0.7 <= len(s["nums"]) / max(1, len(nums)) <= 1.5):
                continue
            ov = len(nums & set(s["nums"]))
            if ov > best_ov:
                best, best_ov = sid, ov
        return best if best_ov >= max(3, int(len(nums) * 0.8)) else None

    def card_id(self, card, target):
        """Extension + numéro d'abord ; le produit TCGplayer ne sert qu'en secours (une promo tamponnée d'une
        autre extension peut partager le produit d'une carte). Une carte de la base n'est jamais attribuée à
        deux cartes TCGdex : la seconde est créée à part."""
        if self.lang == "fr":
            return f"fr-{card['id']}"
        hit = self.sets[target]["nums"].get(_num(card.get("localId"))) if target else None
        if not hit:
            hit = next((self.by_product[p] for p in sorted(_tcg_ids(card)) if p in self.by_product), None)
        if hit and hit not in self.taken:
            self.taken.add(hit)
            return hit
        return f"{self.lang}-{card['id']}"


def _progress_path():
    return os.path.join(os.path.dirname(config.DB_PATH), "cotes_progress.json")


def _store_set(conn, lang, st, full, cards, matcher, owned, today, now):
    """Enregistre une extension : cartes (créées ou complétées), extension, prix."""
    code = LANG_CODE[lang]
    if (full.get("serie") or {}).get("id") == "tcgp":
        return 0, 0, 0  # Pokémon TCG Pocket : cartes numériques, pas de marché
    release = (full.get("releaseDate") or "")[:10] or None
    nums = {_num(c.get("localId")) for c in cards}
    target = matcher.target_set(st["id"], release, nums, full.get("name"))
    our_set = f"fr-{st['id']}" if lang == "fr" else (target or f"{lang}-{st['id']}")
    serie = (full.get("serie") or {}).get("name")
    conn.execute("""INSERT INTO sets (id,name,series,release_date,total) VALUES (?,?,?,?,?)
                    ON CONFLICT(id) DO UPDATE SET name=COALESCE(sets.name, excluded.name),
                      series=COALESCE(sets.series, excluded.series), release_date=COALESCE(sets.release_date, excluded.release_date),
                      total=MAX(COALESCE(sets.total,0), excluded.total)""",
                 (our_set, full.get("name"), serie, release, (full.get("cardCount") or {}).get("total") or len(cards)))
    new_cards, prices, links = [], [], []
    for c in cards:
        cid = matcher.card_id(c, target)
        cm = (c.get("pricing") or {}).get("cardmarket")
        if lang == "ja" and not target and not cm:
            continue  # vieilles extensions japonaises sans cote : déjà au catalogue via TCGplayer, pas de doublon
        if cm and cm.get("idProduct"):
            try:
                links.append((cid, int(cm["idProduct"]), code))
            except (TypeError, ValueError):
                pass
        img = c.get("image")
        new_cards.append({"id": cid, "name": c.get("name"), "set_id": our_set, "set_name": full.get("name"),
                          "number": c.get("localId"), "rarity": c.get("rarity"),
                          "supertype": c.get("category"), "image_small": f"{img}/low.webp" if img else None,
                          "image_large": f"{img}/high.webp" if img else None, "release_date": release,
                          "updated_at": now, "lang": code})
        if lang == "fr" and not config.FR_CARDMARKET:
            continue
        prices.extend(cm_rows(cid, cm))
    # Cartes absentes : créées ; cartes existantes : on ne complète que les champs vides (le catalogue
    # d'origine garde ses noms, images et liens)
    conn.executemany(
        """INSERT INTO cards (id,name,set_id,set_name,number,rarity,supertype,image_small,image_large,release_date,updated_at,lang)
           VALUES (:id,:name,:set_id,:set_name,:number,:rarity,:supertype,:image_small,:image_large,:release_date,:updated_at,:lang)
           ON CONFLICT(id) DO UPDATE SET
             rarity=COALESCE(cards.rarity, excluded.rarity), image_small=COALESCE(cards.image_small, excluded.image_small),
             image_large=COALESCE(cards.image_large, excluded.image_large),
             release_date=COALESCE(cards.release_date, excluded.release_date)""", new_cards)
    conn.executemany("INSERT OR REPLACE INTO cm_map (card_id,id_product,lang) VALUES (?,?,?)", links)
    kept = write_prices(conn, prices, owned)
    conn.commit()
    return len(new_cards), kept, len(prices)


def write_prices(conn, prices, owned):
    """Écrit des lignes Cardmarket (format cm_rows) et met à jour la cote des cartes ; ne valide pas la
    transaction (l'appelant le fait). Renvoie le nombre de lignes écrites."""
    kept = _keep(conn, prices, owned)
    conn.executemany(
        """INSERT OR REPLACE INTO prices (card_id,date,source,variant,price,low,high,avg1,avg7,avg30,currency)
           VALUES (:card_id,:date,:source,:variant,:price,:low,:high,:avg1,:avg7,:avg30,:currency)""", kept)
    # Cote = dernier prix Cardmarket, daté du jour où Cardmarket l'a calculé ; jamais remplacée par un plus ancien
    last = [(r["price"], r["date"], r["card_id"], r["date"]) for r in prices if r["variant"] == "normal"]
    conn.executemany("""UPDATE cards SET last_price=?, last_price_date=? WHERE id=?
                        AND (last_price_date IS NULL OR last_price_date <= ?)""", last)
    return len(kept)


def _keep(conn, prices, owned):
    """Lignes à écrire : toutes pour les cartes à partir de DAILY_MIN_PRICE et celles du Pokédex ; pour les
    autres, seulement si le prix a changé depuis la dernière ligne enregistrée."""
    if not prices:
        return []
    ids = sorted({p["card_id"] for p in prices})
    prev = {}
    for i in range(0, len(ids), 500):
        part = ids[i:i + 500]
        q = f"""SELECT p.card_id, p.variant, p.price, p.low, p.avg30 FROM prices p
                JOIN (SELECT card_id, variant, MAX(date) d FROM prices WHERE source='cardmarket'
                      AND card_id IN ({','.join('?' * len(part))}) GROUP BY card_id, variant) m
                  ON m.card_id=p.card_id AND m.variant=p.variant AND m.d=p.date AND p.source='cardmarket'"""
        for r in conn.execute(q, part):
            prev[(r[0], r[1])] = (r[2], r[3], r[4])
    out = []
    for p in prices:
        if p["card_id"] in owned or p["price"] >= config.DAILY_MIN_PRICE:
            out.append(p)
        elif prev.get((p["card_id"], p["variant"])) != (p["price"], p["low"], p["avg30"]):
            out.append(p)
    return out


def sync(langs=("en", "ja", "fr"), budget=None, workers=8, log=print):
    """Relève le catalogue et la cote Cardmarket de toutes les cartes, extension par extension.

    Reprise : les extensions faites aujourd'hui sont notées dans data/cotes_progress.json ; relancée le
    même jour (après un arrêt au budget de temps), la synchro ne refait que les extensions restantes."""
    db.init()
    t0 = time.time()
    today = date.today().isoformat()
    now = datetime.utcnow().isoformat(timespec="seconds")
    prog_file = _progress_path()
    done = set()
    try:
        with open(prog_file) as f:
            prog = json.load(f)
        if prog.get("date") == today:
            done = set(prog.get("sets_done", []))
    except (OSError, ValueError):
        pass
    stats = {"sets": 0, "cards": 0, "prices": 0, "prices_seen": 0, "errors": [], "stopped": False}
    with db.session() as conn, ThreadPoolExecutor(workers) as pool:
        owned = {r[0] for r in conn.execute("SELECT DISTINCT card_id FROM transactions")}
        for lang in langs:
            matcher = Matcher(conn, lang)
            try:
                sets = _get(_url(lang, "sets"))
            except Exception as e:
                stats["errors"].append(f"{lang}: liste des extensions ({e})")
                continue
            log(f"  {lang} : {len(sets)} extensions")
            for st in sets:
                key = f"{lang}/{st['id']}"
                if key in done:
                    continue
                if budget and time.time() - t0 > budget:
                    stats["stopped"] = True
                    break
                try:
                    full = _get(_url(lang, "sets", st["id"]))
                    briefs = full.get("cards") or []

                    def one(b):
                        try:
                            return _get(_url(lang, "cards", b["id"]))
                        except Exception:
                            return None
                    cards = [c for c in pool.map(one, briefs) if c]
                    if len(cards) < len(briefs):
                        stats["errors"].append(f"{key}: {len(briefs) - len(cards)} cartes non récupérées")
                    n, k, seen = _store_set(conn, lang, st, full, cards, matcher, owned, today, now)
                except Exception as e:
                    stats["errors"].append(f"{key}: {e}")
                    log(f"  {key} en erreur ({e})")
                    continue
                stats["sets"] += 1
                stats["cards"] += n
                stats["prices"] += k
                stats["prices_seen"] += seen
                if len(cards) == len(briefs):
                    done.add(key)
                with open(prog_file, "w") as f:
                    json.dump({"date": today, "sets_done": sorted(done)}, f)
                if stats["sets"] % 20 == 0:
                    log(f"  {stats['sets']} extensions, {stats['cards']} cartes, {stats['prices']} prix écrits")
            if stats["stopped"]:
                log("  budget de temps atteint : relancer aujourd'hui pour finir les extensions restantes")
                break
        db.refresh_fr_prices(conn)
        status = "partial" if stats["stopped"] or stats["errors"] else "ok"
        msg = ("arrêt au budget de temps ; " if stats["stopped"] else "") + "; ".join(stats["errors"][:10])
        conn.execute(
            "INSERT INTO sync_log (started_at,finished_at,source,cards,prices,status,message) VALUES (?,?,?,?,?,?,?)",
            (now, datetime.utcnow().isoformat(timespec="seconds"), "tcgdex-cardmarket", stats["cards"],
             stats["prices"], status, msg[:2000]))
    stats["status"] = status
    stats["seconds"] = int(time.time() - t0)
    log(f"Cotes {status} : {stats['sets']} extensions, {stats['cards']} cartes, {stats['prices']} prix écrits "
        f"({stats['prices_seen']} relevés). {msg[:300]}")
    return stats


def freshness(conn, days=3):
    """Contrôle qualité : part des cartes de chaque langue avec une cote Cardmarket de moins de `days` jours."""
    lim = (date.today() - timedelta(days=days)).isoformat()
    out = {}
    for r in conn.execute("""SELECT COALESCE(lang,'EN') l, COUNT(*) n, SUM(last_price IS NOT NULL) p,
                                    SUM(last_price_date >= ?) f FROM cards GROUP BY l""", (lim,)):
        out[r["l"]] = {"cartes": r["n"], "cotees": r["p"] or 0, f"cote_moins_de_{days}j": r["f"] or 0}
    return out


def completeness(conn, stale_days=7):
    """Contrôle de complétude : une carte que la source relie à Cardmarket doit avoir la cote du dernier guide.

    - « en_retard » : carte reliée à un produit Cardmarket (table cm_map) dont la cote est plus ancienne que le
      dernier guide. C'est un trou de synchro (extension en erreur, arrêt au budget) : relancer la synchro.
    - « orphelines » : carte cotée autrefois que la source ne relie plus à Cardmarket. Sa cote reste affichée
      avec sa date, jamais comme une cote du jour.
    Tant que cm_map est vide (avant la première synchro qui la remplit), une cote de moins de `stale_days`
    jours en retard sur le dernier guide compte comme en retard, au-delà comme orpheline.
    « derniers_releves » : statut du dernier relevé TCGdex et du dernier guide officiel (sync_log).
    ok vaut False s'il y a des cartes en retard ou si aucun des deux derniers relevés n'est complet."""
    # Cartes FR : leur cote est saisie à la main, sauf si config.FR_CARDMARKET (cote toutes langues)
    fr = "" if config.FR_CARDMARKET else " AND COALESCE(lang,'EN') <> 'FR'"
    newest = conn.execute("SELECT MAX(last_price_date) FROM cards WHERE last_price IS NOT NULL" + fr).fetchone()[0]
    out = {"guide_le_plus_recent": newest, "langues": {}, "en_retard_par_extension": {}}
    if not newest:
        return out | {"ok": False}
    if conn.execute("SELECT 1 FROM cm_map LIMIT 1").fetchone():
        late_sql = "last_price_date < :n AND id IN (SELECT card_id FROM cm_map)"
    else:
        late_sql = "last_price_date < :n AND last_price_date >= :lim"
    params = {"n": newest, "lim": (date.fromisoformat(newest) - timedelta(days=stale_days)).isoformat()}
    late = 0
    for r in conn.execute(f"""SELECT COALESCE(lang,'EN') l, COUNT(*) n, SUM(last_price IS NOT NULL) p,
                                     SUM(last_price_date = :n) d, SUM(COALESCE({late_sql}, 0)) r
                              FROM cards WHERE 1=1{fr} GROUP BY l""", params):
        p, d, rr = r["p"] or 0, r["d"] or 0, r["r"] or 0
        out["langues"][r["l"]] = {"cartes": r["n"], "cotees": p, "cote_du_dernier_guide": d, "en_retard": rr,
                                  "orphelines": p - d - rr, "sans_cote": r["n"] - p}
        late += rr
    for r in conn.execute(f"""SELECT COALESCE(lang,'EN') || ' ' || COALESCE(set_name, set_id) s, COUNT(*) n FROM cards
                              WHERE {late_sql}{fr} GROUP BY s ORDER BY n DESC LIMIT 20""", params):
        out["en_retard_par_extension"][r["s"]] = r["n"]
    # Dernier relevé de chaque chemin (TCGdex, guide officiel) : un seul complet suffit
    out["derniers_releves"] = {}
    for src in ("tcgdex-cardmarket", "cardmarket-guide"):
        run = conn.execute("SELECT finished_at, status, message FROM sync_log WHERE source=? ORDER BY id DESC LIMIT 1",
                           (src,)).fetchone()
        if run:
            out["derniers_releves"][src] = dict(run)
    out["ok"] = late == 0 and any(r["status"] == "ok" for r in out["derniers_releves"].values())
    return out
