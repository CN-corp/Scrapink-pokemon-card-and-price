"""Illustrations françaises manquantes : scans de Poképédia (wiki francophone, MediaWiki).

TCGdex n'a pas d'image pour environ 13 % des cartes françaises (Diamant & Perle, promos, kits,
coffres étincelants…). Poképédia publie les scans sous le nom « Carte <Extension> <numéro>.png »,
rangés dans la catégorie « Scan de carte de <Extension> ». Pour chaque extension française qui a
des cartes sans image, on liste ses fichiers (préfixe, puis catégorie) et on relie chaque carte à
son scan par le numéro. Les adresses sont enregistrées dans cards (image_small = miniature 245 px,
image_large = original) ; `cartes-fr` ne les écrase pas tant que TCGdex n'a rien de mieux.

Droits : ces scans sont des images protégées que Poképédia diffuse au titre de l'exception
française (art. L. 122-5 CPI). Les reprendre sur un site payant n'est pas couvert d'office.
"""
import json
import re
import time
import urllib.parse
import urllib.request

from . import db

API = "https://www.pokepedia.fr/api.php"
UA = {"User-Agent": "pokedex-trader/1.0 (illustrations FR ; contact via le site)"}
THUMB = 245

# Nom TCGdex -> noms de fichiers Poképédia (essayés avant le nom TCGdex ; l'API distingue la casse).
ALIASES = {
    "Éveil des Légendes": ["Diamant & Perle Éveil des Légendes"],
    "Trésors Mystérieux": ["Diamant & Perle Trésors Mystérieux"],
    "Duels au Sommets": ["Diamant & Perle Duels au sommet"],
    "Tempête": ["Diamant & Perle Tempête"],
    "Aube Majestueuse": ["Diamant & Perle Aube Majestueuse"],
    "L'appel des Légendes": ["L'Appel des Légendes"],
    "Majesté Des Dragons": ["Majesté des Dragons"],
    "Harmonie des Esprits": ["Soleil et Lune Harmonie des Esprits"],
    "Alliance Infaillible": ["Soleil et Lune Alliance Infaillible"],
    "Destinées Radieuses Coffre Étincelant": ["Destinées Radieuses"],
    "Destinées Occultes Coffre Étincelant": ["Destinées Occultes"],
    "Zénith Suprême Galerie Galaroise": ["Zénith Suprême"],
    "Stars Étincelantes Galerie de Dresseurs": ["Épée et Bouclier Stars Étincelantes"],
    "Astres Radieux Galerie de Dresseurs": ["Épée et Bouclier Astres Radieux"],
    "Origine Perdue Galerie de Dresseurs": ["Épée et Bouclier Origine Perdue"],
    "Tempête Argentée Galerie de Dresseurs": ["Épée et Bouclier Tempête Argentée"],
    "MEP Black Star Promos": ["Promo ME"],
    "SVP Black Star Promos": ["Promo SV"],
    "Wizards Black Star Promos": ["Promo Wizards"],
    "Collection McDonald's 2019": ["Collection McDonald's 2019 (France)"],
    "Écarlate et Violet Énergie": ["Écarlate et Violet Énergie de base"],
    "Méga-Évolution Énergie": ["Méga-Évolution Énergie de base"],
    "BW Kit du dresseur (Minitaupe)": ["Noir & Blanc Kit du Dresseur Minotaupe"],
    "BW Kit du dresseur (Zoroark)": ["Noir & Blanc Kit du Dresseur Zoroark"],
    "XY Kit du dresseur (Scalproie)": ["XY Kit du Dresseur Scalproie"],
    "XY Kit du dresseur (Grodoudou)": ["XY Kit du Dresseur Grodoudou"],
    "XY Kit du dresseur (Pikachu Libre)": ["XY Kit du Dresseur Pikachu Catcheur"],
    "XY Kit du dresseur (Suicune)": ["XY Kit du Dresseur Suicune"],
    "EX Kit dresseur (Négapi)": ["EX Kit Dresseur 2 Négapi"],
    "EX Kit dresseur (Positi)": ["EX Kit Dresseur 2 Posipi"],
    "DP Kit dresseur (Manaphy)": ["Diamant & Perle Kit Dresseur Manaphy"],
    "DP Kit dresseur (Lucario)": ["Diamant & Perle Kit Dresseur Lucario"],
    "HeartGold SoulSilver": ["HeartGold & SoulSilver"],
    "Déchaînement": ["HS Déchaînement"],
    "Indomptable": ["HS Indomptable"],
    "Triomphant": ["HS Triomphant"],
}
# Cartes « ONE », « TWO »… des boîtes HGSS : Poképédia les numérote en français.
NUM_WORDS = {"ONE": "UN", "TWO": "DEUX", "THREE": "TROIS", "FOUR": "QUATRE"}


def _api(params, retries=3):
    q = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=UA), timeout=60) as r:
                return json.loads(r.read())
        except Exception:  # noqa: BLE001
            if i == retries - 1:
                raise
            time.sleep(2 * (i + 1))


def _num(s):
    """'011' -> '11', 'SV-P 12' -> 'SVP12', 'DP01' -> 'DP1' : clé de rapprochement des numéros."""
    s = re.sub(r"[\s_\-]", "", (s or "").upper())
    s = NUM_WORDS.get(s, s)
    m = re.match(r"^([A-Z]*)0*(\d+)([A-Z]*)$", s)
    return f"{m.group(1)}{int(m.group(2))}{m.group(3)}" if m else s


def _files_of(set_name, fetch=_api):
    """Fichiers « Carte <set> <n>.png » de l'extension : {numéro normalisé: titre}."""
    out = {}
    pref = f"Carte {set_name} ".replace(" ", "_")
    for kind, params in (("prefix", {"list": "allimages", "aiprefix": pref, "ailimit": "500"}),
                         ("cat", {"list": "categorymembers", "cmtitle": f"Catégorie:Scan de carte de {set_name}",
                                  "cmtype": "file", "cmlimit": "500"})):
        cont = {}
        while True:
            data = fetch({"action": "query", **params, **cont})
            items = data.get("query", {}).get("allimages" if kind == "prefix" else "categorymembers", [])
            for it in items:
                title = it.get("title") or ("Fichier:" + it.get("name", "").replace("_", " "))
                base = re.sub(r"^Fichier:", "", title).replace("_", " ")
                m = re.match(r"^(.*)\.(png|jpe?g|webp)$", base, re.I)
                if not m:
                    continue
                stem = m.group(1)
                head = f"Carte {set_name} "
                rest = stem[len(head):] if stem.lower().startswith(head.lower()) else stem.rsplit(" ", 1)[-1]
                if (re.search(r"\d", rest) or rest.upper() in NUM_WORDS.values()) and len(rest) <= 12:
                    out.setdefault(_num(rest), title)
            if "continue" not in data:
                break
            cont = {k: v for k, v in data["continue"].items()}
        if out:
            break
    return out


def _urls(titles, fetch=_api):
    """{titre: (miniature, original)} par lots de 50."""
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 50):
        data = fetch({"action": "query", "titles": "|".join(titles[i:i + 50]), "prop": "imageinfo",
                      "iiprop": "url", "iiurlwidth": str(THUMB)})
        norm = {n["to"]: n["from"] for n in data.get("query", {}).get("normalized", [])}
        for p in data.get("query", {}).get("pages", []):
            ii = (p.get("imageinfo") or [None])[0]
            if ii and ii.get("url"):
                out[norm.get(p["title"], p["title"])] = (ii.get("thumburl") or ii["url"], ii["url"])
    return out


def build(log=print, fetch=_api, sleep=0.2):
    """Complète image_small / image_large des cartes FR sans illustration. Renvoie un résumé."""
    db.init()
    with db.session() as conn:
        rows = conn.execute("""SELECT id, set_id, set_name, number FROM cards
                               WHERE lang='FR' AND (image_small IS NULL OR image_small='')""").fetchall()
    by_set = {}
    for r in rows:
        by_set.setdefault((r["set_id"], r["set_name"]), []).append(r)
    if not rows:
        log("Poképédia : toutes les cartes FR ont déjà une illustration.")
        return {"cards_missing": 0, "found": 0}
    try:
        fetch({"action": "query", "meta": "siteinfo"})
    except Exception as e:  # noqa: BLE001
        log(f"Poképédia injoignable ({e}) : domaine www.pokepedia.fr à autoriser.")
        return {"status": "unreachable", "cards_missing": len(rows), "found": 0}
    found, sets_ok, missing_sets, updates = 0, 0, [], []
    for (sid, sname), cards in sorted(by_set.items(), key=lambda kv: -len(kv[1])):
        try:
            files = {}
            for name in ALIASES.get(sname, []) + [sname]:
                files = _files_of(name, fetch)
                if files:
                    break
        except Exception as e:  # noqa: BLE001
            log(f"  {sname} : erreur {e}")
            continue
        if not files:
            missing_sets.append(sname)
            continue
        want = {c["id"]: files[_num(c["number"])] for c in cards if _num(c["number"]) in files}
        urls = _urls(set(want.values()), fetch) if want else {}
        n = 0
        for cid, title in want.items():
            if title in urls:
                small, large = urls[title]
                updates.append((small, large, cid))
                n += 1
        found += n
        sets_ok += bool(n)
        log(f"  {sname} : {n}/{len(cards)} illustrations trouvées")
        time.sleep(sleep)
    if updates:
        with db.session() as conn:
            conn.executemany("UPDATE cards SET image_small=?, image_large=? WHERE id=? AND (image_small IS NULL OR image_small='')",
                             updates)
    log(f"Poképédia : {found}/{len(rows)} cartes FR illustrées, {sets_ok} extensions ; "
        f"{len(missing_sets)} extensions introuvables" + (f" ({', '.join(missing_sets[:12])}…)" if missing_sets else ""))
    return {"cards_missing": len(rows), "found": found, "sets_found": sets_ok, "sets_not_found": missing_sets}
