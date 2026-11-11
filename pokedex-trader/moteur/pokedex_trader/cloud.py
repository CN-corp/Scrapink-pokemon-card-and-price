"""Pont entre la base locale et la page en ligne (base de données de l'artifact).

La page en ligne stocke ce que l'utilisateur saisit :
  transactions/<id>  achats et ventes du Pokédex
  targets/<card_id>  objectifs de prix personnels
et lit ce que la synchro quotidienne calcule, tout dans la collection `app` :
  app/status, app/market, app/pokedex, app/perf, app/reports-AAAA,
  app/catalog-N (toutes les cartes cotées, pour la recherche),
  app/rank-N (classement de toutes les cartes analysées, à partir de 50 €),
  app/hist-N (historiques, la carte X est dans hist-(hash(X) % status.hist_buckets)).

`cloud-import` lit les documents téléchargés de la page, `cloud-export` écrit les documents
à envoyer, plus un manifest.json qui les regroupe en lots de taille compatible.
"""
import json
from datetime import date, datetime
from pathlib import Path

from . import analysis, config, db, portfolio, reports

MAX_DOC_BYTES = 200_000
MAX_BATCH_BYTES = 900_000
MAX_BATCH_DOCS = 50


def _read_docs(folder):
    """Documents téléchargés : <folder>/<id>.json, avec ou sans enveloppe {data: ...}."""
    folder = Path(folder)
    out = {}
    if not folder.is_dir():
        return out
    for f in sorted(folder.glob("*.json")):
        obj = json.loads(f.read_text(encoding="utf-8"))
        if isinstance(obj, dict) and isinstance(obj.get("data"), dict):
            obj = obj["data"]
        out[f.stem] = obj
    return out


def import_inputs(src):
    """Remplace transactions, objectifs et prix constatés par ceux saisis sur la page en ligne.

    Une collection n'est remplacée que si son dossier existe dans l'export : un chemin mal tapé ou un
    téléchargement incomplet ne doit jamais effacer le Pokédex local.
    """
    src = Path(src)
    if not src.is_dir():
        raise SystemExit(f"Dossier d'import introuvable : {src} (rien n'a été modifié)")
    present = {name: (src / name).is_dir() for name in ("transactions", "targets", "observed")}
    if not any(present.values()):
        raise SystemExit(f"Aucun dossier transactions/, targets/ ni observed/ dans {src} (rien n'a été modifié)")
    db.init()
    txs = _read_docs(src / "transactions")
    targets = _read_docs(src / "targets")
    skipped = []
    rows = []
    with db.session() as conn:
        for doc_id, t in (txs.items() if present["transactions"] else ()):
            cid = t.get("card_id")
            try:
                qty = int(t.get("quantity") or 0)
                price = float(t.get("unit_price"))
            except (TypeError, ValueError):
                skipped.append(doc_id)
                continue
            try:
                fees = float(t.get("fees") or 0)
            except (TypeError, ValueError):
                skipped.append(doc_id)
                continue
            if not cid or qty <= 0 or price < 0 or fees < 0 or t.get("side") not in ("buy", "sell"):
                skipped.append(doc_id)
                continue
            if not conn.execute("SELECT 1 FROM cards WHERE id=?", (cid,)).fetchone():
                conn.execute("INSERT INTO cards (id, name, set_name, number) VALUES (?,?,?,?)",
                             (cid, t.get("name") or cid, t.get("set_name"), t.get("number")))
            rows.append((cid, t["side"], t.get("date") or date.today().isoformat(), qty, price,
                         fees, t.get("condition") or "NM", t.get("language") or "FR",
                         t.get("platform"), f"web:{doc_id}"))
        rows.sort(key=lambda r: (r[2], 0 if r[1] == "buy" else 1))
        if present["transactions"]:
            conn.execute("DELETE FROM transactions")
        conn.executemany(
            """INSERT INTO transactions (card_id,side,date,quantity,unit_price,fees,condition,language,platform,notes)
               VALUES (?,?,?,?,?,?,?,?,?,?)""", rows)
        # Prix constatés saisis sur la page (cartes françaises surtout) : observed/<card_id> = {prices: {date: prix}}
        observed = _read_docs(src / "observed") if present["observed"] else {}
        if present["observed"]:
            conn.execute("DELETE FROM prices WHERE source='manual'")
        n_obs = 0
        for cid, o in observed.items():
            cid = o.get("card_id") or cid
            if not conn.execute("SELECT 1 FROM cards WHERE id=?", (cid,)).fetchone():
                continue
            for d, v in (o.get("prices") or {}).items():
                try:
                    v = float(v)
                    date.fromisoformat(d)
                except (TypeError, ValueError):
                    continue
                if v > 0:
                    conn.execute("INSERT OR REPLACE INTO prices (card_id,date,source,variant,price) VALUES (?,?,'manual','normal',?)",
                                 (cid, d, v))
                    n_obs += 1
        if present["targets"]:
            conn.execute("DELETE FROM targets")
        for cid, t in (targets.items() if present["targets"] else ()):
            conn.execute("INSERT INTO targets (card_id, buy_below, sell_above) VALUES (?,?,?)",
                         (t.get("card_id") or cid, t.get("buy_below"), t.get("sell_above")))
    return {"transactions": len(rows), "targets": len(targets), "observed_prices": n_obs, "skipped": skipped,
            "collections_absentes": [k for k, v in present.items() if not v]}


def _slim(r):
    keys = ("card_id", "name", "set_name", "number", "rarity", "signal", "buy_score", "sell_score", "price",
            "mom7", "mom30", "mom90", "est30", "est90", "est30_range", "exp_return30_net", "vol30", "rsi",
            "sma30", "ath_365", "other_market", "reasons_buy", "reasons_sell", "owned_qty", "avg_cost",
            "gain_net_pct", "weight", "history_days", "release_date", "lang", "confidence", "rank_buy",
            "rank_sell", "mom365", "trend_year", "fr_observed")
    return {k: (round(r[k], 4) if isinstance(r.get(k), float) else r.get(k)) for k in keys if k in r}


def _chunks(items, key_fn, prefix):
    """Découpe une liste en documents de moins de MAX_DOC_BYTES."""
    docs, cur, size = [], [], 2
    for it in items:
        s = len(json.dumps(it, ensure_ascii=False)) + 1
        if cur and size + s > MAX_DOC_BYTES:
            docs.append(cur)
            cur, size = [], 2
        cur.append(it)
        size += s
    if cur:
        docs.append(cur)
    return {f"{prefix}-{i}": key_fn(d) for i, d in enumerate(docs)}


def hist_bucket(card_id, n):
    """Même calcul que la page (FNV-1a 32 bits) pour retrouver le document d'historique d'une carte."""
    h = 0x811C9DC5
    for ch in card_id.encode("utf-8"):
        h = ((h ^ ch) * 0x01000193) & 0xFFFFFFFF
    return h % n


def _downsample(series, max_daily=90, max_points=220):
    if len(series) <= max_points:
        return series
    recent = series[-max_daily:]
    old = series[:-max_daily]
    step = max(1, len(old) // (max_points - max_daily))
    return old[::step] + recent


def export(out):
    db.init()
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    docs = {}
    with db.session() as conn:
        db.refresh_fr_prices(conn)
        stats = conn.execute("SELECT COUNT(DISTINCT date) d, MAX(date) b FROM prices").fetchone()
        n_cards = conn.execute("SELECT COUNT(*) n FROM cards").fetchone()["n"]
        last = conn.execute("SELECT * FROM sync_log ORDER BY id DESC LIMIT 1").fetchone()
        docs["status"] = {"updated_at": now, "cards": n_cards, "last_price_date": stats["b"],
                          "history_days": stats["d"], "last_sync": dict(last) if last else None,
                          "sell_fee_pct": config.SELL_FEE_PCT, "sell_fixed_fee": config.SELL_FIXED_FEE}

        allres = analysis.analyze(conn, min_price=0)
        owned = [r for r in allres if r.get("owned_qty")]
        market = [r for r in allres if r["price"] >= config.MIN_TRADE_PRICE and not r.get("owned_qty")]
        market.sort(key=lambda r: (-r["buy_score"], -r["exp_return30_net"]))
        movers = sorted([r for r in allres if r["price"] >= 10 and r.get("mom7") is not None],
                        key=lambda r: -(r["mom7"] or 0))
        docs["market"] = {"updated_at": now,
                          "buy": [_slim(r) for r in market[:150]],
                          "hot": [_slim(r) for r in movers[:30]],
                          "cold": [_slim(r) for r in movers[::-1][:30]]}

        pos, realized = portfolio.positions(conn)
        docs["pokedex"] = {"updated_at": now,
                           "signals": {r["card_id"]: _slim(r) for r in owned},
                           "realized": realized}
        curve = portfolio.equity_curve(conn)
        docs["perf"] = {"updated_at": now, "summary": portfolio.summary(conn),
                        "curve": _downsample(curve, 120, 500)}

        by_year = {}
        for m in portfolio.months_available(conn):
            data = portfolio.monthly_report(conn, m)
            if data:
                data.pop("transactions", None)
                by_year.setdefault(m[:4], {})[m] = {"data": data, "markdown": reports.render_month(conn, m)}
        for y, months in by_year.items():
            docs[f"reports-{y}"] = {"updated_at": now, "months": months}

        catalog = []
        for r in conn.execute(
                """SELECT c.id, c.name, c.set_name, c.number, c.rarity, c.release_date, COALESCE(c.lang,'EN') lang,
                          COALESCE((SELECT price FROM prices p WHERE p.card_id=c.id AND p.variant='normal'
                           AND p.source IN ('cardmarket','manual')
                           ORDER BY date DESC, CASE source WHEN 'cardmarket' THEN 0 ELSE 1 END LIMIT 1), c.last_price) price
                   FROM cards c"""):
            if r["lang"] != "EN" and not r["price"]:
                continue  # cartes japonaises sans cote : inutile de les proposer
            catalog.append([r["id"], r["name"], r["set_name"], r["number"], r["rarity"],
                            round(r["price"], 2) if r["price"] else None, (r["release_date"] or "")[:4], r["lang"]])
        catalog.sort(key=lambda c: -(c[5] or 0))
        docs.update(_chunks(catalog, lambda d: {"updated_at": now, "cards": d}, "catalog"))

        # Classement : toutes les cartes analysées à partir du seuil, plus celles du Pokédex
        ranked = [r for r in allres if r["price"] >= config.MIN_TRADE_PRICE or r.get("owned_qty")]
        ranked.sort(key=lambda r: -r["rank_buy"])
        items = [{**_slim(r), "reasons_buy": r["reasons_buy"][:3], "reasons_sell": r["reasons_sell"][:3],
                  "est90": r.get("est90"), "image_small": r.get("image_small")} for r in ranked]
        docs.update(_chunks(items, lambda d: {"updated_at": now, "cards": d}, "rank"))

        tracked = {r["card_id"] for r in ranked} | {r["card_id"] for r in movers[:30] + movers[::-1][:30]}
        series = {cid: _downsample([[d, round(p, 2)] for d, p in db.price_series(conn, cid)], 120, 200)
                  for cid in sorted(tracked)}
        total = sum(len(json.dumps(v)) + len(k) + 6 for k, v in series.items())
        nb = max(1, -(-total * 13 // 10 // MAX_DOC_BYTES))
        buckets = [{} for _ in range(nb)]
        for cid, v in series.items():
            buckets[hist_bucket(cid, nb)][cid] = v
        for i, b in enumerate(buckets):
            docs[f"hist-{i}"] = {"updated_at": now, "series": b}
        docs["status"]["hist_buckets"] = nb
        docs["status"]["langs"] = sorted({r["lang"] for r in ranked})
        first = conn.execute("SELECT MIN(date) d FROM prices").fetchone()["d"]
        docs["status"]["history_since"] = first

    files, batches, cur, size = [], [], [], 0
    for doc_id, body in docs.items():
        path = out / f"{doc_id}.json"
        text = json.dumps(body, ensure_ascii=False, default=str, separators=(",", ":"))
        path.write_text(text, encoding="utf-8")
        b = len(text.encode("utf-8"))
        files.append({"doc_id": doc_id, "file_path": str(path), "bytes": b})
        if cur and (size + b > MAX_BATCH_BYTES or len(cur) >= MAX_BATCH_DOCS):
            batches.append(cur)
            cur, size = [], 0
        cur.append(doc_id)
        size += b
    if cur:
        batches.append(cur)
    manifest = {"collection": "app", "docs": files, "batches": batches}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    return manifest


def build_batches(manifest_path, versions_path=None):
    """Prépare les écritures ArtifactData (avec if_version) à partir du manifeste.

    versions_path : JSON {doc_id: version} des documents `app` existants.
    Renvoie une liste de lots, chacun une liste d'écritures prêtes à envoyer, plus les
    suppressions des documents devenus inutiles (ex. moins de morceaux de catalogue).
    """
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    versions = json.loads(Path(versions_path).read_text(encoding="utf-8")) if versions_path else {}
    by_id = {d["doc_id"]: d for d in manifest["docs"]}
    out = []
    for batch in manifest["batches"]:
        writes = []
        for doc_id in batch:
            w = {"op": "set", "collection": "app", "doc_id": doc_id, "file_path": by_id[doc_id]["file_path"]}
            if doc_id in versions:
                w["if_version"] = versions[doc_id]
            writes.append(w)
        out.append(writes)
    stale = [d for d in versions if d not in by_id and d.startswith(("catalog-", "history-", "hist-", "rank-", "reports-"))]
    if stale:
        out.append([{"op": "delete", "collection": "app", "doc_id": d, "if_version": versions[d]} for d in stale])
    return out


def tracked_ids(conn):
    """Cartes affichées sur la page : Pokédex, classement (à partir du seuil), plus fortes variations."""
    res = analysis.analyze(conn, min_price=0)
    ids = {r["card_id"] for r in res if r.get("owned_qty") or r["price"] >= config.MIN_TRADE_PRICE}
    ids |= {row[0] for row in conn.execute("SELECT DISTINCT card_id FROM transactions")}
    movers = sorted([r for r in res if r["price"] >= 10 and r.get("mom7") is not None], key=lambda r: -(r["mom7"] or 0))
    return ids | {r["card_id"] for r in movers[:30] + movers[::-1][:30]}


def fetch_images(out, have_path=None, width=600, limit=400, log=print):
    """Télécharge les illustrations (grand format) des cartes suivies qui n'ont pas encore
    d'image sur la page, les réduit en WebP et liste les fichiers à envoyer."""
    import urllib.request
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    have = json.loads(Path(have_path).read_text(encoding="utf-8")) if have_path else {}
    have = have.get("images", have)
    try:
        from PIL import Image
    except ImportError:
        Image = None
    todo = []
    with db.session() as conn:
        ids = sorted(tracked_ids(conn) - set(have))[:limit]
        for cid in ids:
            r = conn.execute("SELECT image_large, image_small FROM cards WHERE id=?", (cid,)).fetchone()
            url = r and (r["image_large"] or r["image_small"])
            if not url:
                continue
            safe = cid.replace("/", "_")
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "pokedex-trader/1.0"})
                raw = urllib.request.urlopen(req, timeout=60).read()
            except Exception as e:
                log(f"  image {cid} : {e}")
                continue
            if Image:
                import io
                im = Image.open(io.BytesIO(raw)).convert("RGBA")
                if im.width > width:
                    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
                path = out / f"{safe}.webp"
                im.save(path, "WEBP", quality=82)
            else:
                path = out / f"{safe}.png"
                path.write_bytes(raw)
            todo.append({"card_id": cid, "file_path": str(path)})
    groups = [todo[i:i + 25] for i in range(0, len(todo), 25)]
    (out / "images_todo.json").write_text(json.dumps({"groups": groups}, indent=1), encoding="utf-8")
    log(f"{len(todo)} illustrations prêtes en {len(groups)} envois -> {out}/images_todo.json")
    return groups
