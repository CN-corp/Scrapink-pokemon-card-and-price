"""Serveur web (bibliothèque standard uniquement) : API JSON + tableau de bord."""
import json
import mimetypes
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import analysis, config, db, ingest, portfolio, reports

_sync_state = {"running": False, "last": None, "progress": ""}


def _search(conn, q, limit=30):
    like = f"%{q}%"
    rows = conn.execute(
        """SELECT c.*, (SELECT price FROM prices p WHERE p.card_id=c.id AND p.variant='normal'
                         ORDER BY date DESC, CASE source WHEN 'cardmarket' THEN 0 ELSE 1 END LIMIT 1) AS price
           FROM cards c WHERE c.name LIKE ? OR c.id LIKE ? OR c.set_name LIKE ?
           ORDER BY price DESC NULLS LAST LIMIT ?""",
        (like, like, like, limit))
    return [dict(r) for r in rows]


def _stats(conn):
    r = conn.execute("SELECT COUNT(*) n FROM cards").fetchone()
    p = conn.execute("SELECT COUNT(*) n, MIN(date) a, MAX(date) b, COUNT(DISTINCT date) d FROM prices").fetchone()
    last = conn.execute("SELECT * FROM sync_log ORDER BY id DESC LIMIT 1").fetchone()
    return {"cards": r["n"], "price_points": p["n"], "first_date": p["a"], "last_date": p["b"], "days": p["d"],
            "last_sync": dict(last) if last else None, "sync": _sync_state}


def _run_sync(query):
    _sync_state.update(running=True, progress="démarrage…")
    try:
        _sync_state["last"] = ingest.sync(query=query, log=lambda m: _sync_state.update(progress=m))
    finally:
        _sync_state["running"] = False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        url = urlparse(self.path)
        qs = {k: v[0] for k, v in parse_qs(url.query).items()}
        path = url.path
        if not path.startswith("/api/"):
            return self._static(path)
        try:
            with db.session() as conn:
                if path == "/api/stats":
                    return self._send(_stats(conn))
                if path == "/api/search":
                    return self._send(_search(conn, qs.get("q", "")))
                if path == "/api/opportunities":
                    return self._send(analysis.opportunities(
                        conn, qs.get("kind", "buy"), int(qs.get("limit", 60)),
                        min_price=float(qs["min_price"]) if qs.get("min_price") else None))
                if path == "/api/card":
                    d = analysis.card_detail(conn, qs.get("id", ""))
                    return self._send(d or {"error": "carte introuvable"}, 200 if d else 404)
                if path == "/api/pokedex":
                    pos, realized = portfolio.positions(conn)
                    sig = {a["card_id"]: a for a in analysis.analyze(conn, card_ids=[p["card_id"] for p in pos], min_price=0)}
                    for p in pos:
                        a = sig.get(p["card_id"], {})
                        p.update(signal=a.get("signal"), sell_score=a.get("sell_score"), buy_score=a.get("buy_score"),
                                 est30=a.get("est30"), reasons=a.get("reasons_sell", []) + a.get("reasons_buy", []))
                    return self._send({"positions": pos, "realized": realized[::-1],
                                       "transactions": portfolio.transactions(conn)[::-1]})
                if path == "/api/performance":
                    return self._send({"summary": portfolio.summary(conn), "curve": portfolio.equity_curve(conn)})
                if path == "/api/months":
                    return self._send(portfolio.months_available(conn)[::-1])
                if path == "/api/report":
                    m = qs.get("month")
                    return self._send({"data": portfolio.monthly_report(conn, m), "markdown": reports.render_month(conn, m)})
            return self._send({"error": "route inconnue"}, 404)
        except Exception as e:
            return self._send({"error": str(e)}, 500)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = self._body()
            with db.session() as conn:
                if path == "/api/transactions":
                    tx = portfolio.add_transaction(
                        conn, data["card_id"], data["side"], int(data["quantity"]), float(data["unit_price"]),
                        data.get("date") or None, float(data.get("fees") or 0), data.get("condition") or "NM",
                        data.get("language") or "FR", data.get("platform"), data.get("notes"))
                    return self._send({"id": tx})
                if path == "/api/transactions/delete":
                    portfolio.delete_transaction(conn, int(data["id"]))
                    return self._send({"ok": True})
                if path == "/api/targets":
                    conn.execute("INSERT OR REPLACE INTO targets (card_id, buy_below, sell_above) VALUES (?,?,?)",
                                 (data["card_id"], data.get("buy_below") or None, data.get("sell_above") or None))
                    return self._send({"ok": True})
                if path == "/api/price":
                    ingest.add_manual_price(conn, data["card_id"], float(data["price"]), data.get("date"))
                    return self._send({"ok": True})
                if path == "/api/report/export":
                    p = reports.export_month(conn, data["month"])
                    return self._send({"path": str(p) if p else None})
            if path == "/api/sync":
                if _sync_state["running"]:
                    return self._send({"error": "synchro déjà en cours"}, 409)
                threading.Thread(target=_run_sync, args=(data.get("query") or None,), daemon=True).start()
                return self._send({"started": True})
            return self._send({"error": "route inconnue"}, 404)
        except (ValueError, KeyError) as e:
            return self._send({"error": str(e)}, 400)
        except Exception as e:
            return self._send({"error": str(e)}, 500)

    def _static(self, path):
        f = (config.STATIC_DIR / (path.lstrip("/") or "index.html")).resolve()
        if not str(f).startswith(str(config.STATIC_DIR.resolve())) or not f.is_file():
            f = config.STATIC_DIR / "index.html"
        body = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", (mimetypes.guess_type(f.name)[0] or "text/html") + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def serve(host="127.0.0.1", port=8765):
    db.init()
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"Tableau de bord : http://{host}:{port}")
    httpd.serve_forever()
