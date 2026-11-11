"""Actualités du Pokémon TCG pour le bandeau du site public (titres et liens de flux RSS / Atom).

    python3 -m pokedex_trader news              (relève les flux et les publie sur le site)
    python3 -m pokedex_trader news --dry-run    (affiche les titres sans rien envoyer)

Seuls le titre, le lien, la source et la date sont repris : le lecteur clique pour lire l'article
sur le site d'origine. Flux par défaut ci-dessous, remplaçables par la variable PTRADER_NEWS_FEEDS
au format « url|source|langue » séparés par des points-virgules.
Domaines à autoriser dans l'environnement : www.pokebeach.com, news.google.com.
Publication : mêmes variables que publish-site (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), table news.
Bibliothèque standard uniquement.
"""
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = "pokedex-trader-news/1.0"
DEFAULT_FEEDS = [
    ("https://www.pokebeach.com/feed", "PokéBeach", "EN"),
    ("https://news.google.com/rss/search?q=%22Pok%C3%A9mon%22+(JCC+OR+%22cartes+Pok%C3%A9mon%22+OR+TCG)&hl=fr&gl=FR&ceid=FR:fr",
     "Google Actualités", "FR"),
]
MAX_AGE_DAYS = 45
PER_FEED = 15


def feeds():
    raw = os.environ.get("PTRADER_NEWS_FEEDS", "").strip()
    if not raw:
        return DEFAULT_FEEDS
    out = []
    for part in raw.split(";"):
        bits = [b.strip() for b in part.split("|")]
        if bits and bits[0].startswith("http"):
            out.append((bits[0], bits[1] if len(bits) > 1 else "", bits[2] if len(bits) > 2 else "FR"))
    return out


def _date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _text(el, *names):
    for n in names:
        x = el.find(n)
        if x is not None and (x.text or "").strip():
            return x.text.strip()
    return ""


def parse(xml_bytes, source, lang):
    """Éléments d'un flux RSS 2.0 ou Atom : [{title, url, source, lang, published_at}]."""
    root = ET.fromstring(xml_bytes)
    atom = "{http://www.w3.org/2005/Atom}"
    items = root.findall("./channel/item") or root.findall(f"{atom}entry")
    out = []
    for it in items:
        title = _text(it, "title", f"{atom}title")
        link = _text(it, "link")
        if not link:
            a = it.find(f"{atom}link")
            link = a.get("href", "") if a is not None else ""
        src = source
        # Google Actualités : « Titre - Média » ; on garde le média comme source
        s = it.find("source")
        if s is not None and (s.text or "").strip():
            src = s.text.strip()
            title = re.sub(r"\s+-\s+" + re.escape(src) + r"\s*$", "", title)
        when = _date(_text(it, "pubDate", f"{atom}published", f"{atom}updated"))
        title = re.sub(r"\s+", " ", title).strip()
        if len(title) < 3 or not link.startswith("http"):
            continue
        out.append({"title": title[:300], "url": link[:1000], "source": src[:80] or None, "lang": lang,
                    "kind": "news", "published_at": (when or datetime.now(timezone.utc)).isoformat(timespec="seconds")})
    return out


def collect(log=print):
    limit = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    rows, seen = [], set()
    for url, source, lang in feeds():
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, */*"})
            with urllib.request.urlopen(req, timeout=30) as r:
                items = parse(r.read(), source, lang)
        except Exception as e:  # flux refusé ou illisible : on continue avec les autres
            log(f"  flux {source or url} indisponible : {e}")
            continue
        items = [i for i in items if i["published_at"] >= limit.isoformat(timespec="seconds")]
        items.sort(key=lambda i: i["published_at"], reverse=True)
        n = 0
        for i in items:
            if i["url"] in seen or n >= PER_FEED:
                continue
            seen.add(i["url"])
            rows.append(i)
            n += 1
        log(f"  {source or url} : {n} titre(s)")
    return rows


def main(dry_run=False, log=print):
    rows = collect(log)
    if dry_run:
        for r in rows:
            log(f"{r['published_at'][:10]}  [{r['source']}] {r['title']}")
        log(f"Simulation : {len(rows)} titre(s), rien n'a été envoyé.")
        return 0
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        log("news : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY ne sont pas définies, actualités non publiées.")
        return 0
    if not rows:
        log("news : aucun titre relevé.")
        return 0
    from .publish_site import Rest
    rest = Rest(url, key, log)
    try:
        rest.upsert("news", rows, "url", label="news")
        old = (datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)).isoformat(timespec="seconds")
        rest.call("DELETE", f"/news?kind=eq.news&published_at=lt.{urllib.request.quote(old)}",
                  prefer="return=minimal")
    except RuntimeError as e:
        log(f"news : publication impossible : {e}")
        return 1
    return 0
