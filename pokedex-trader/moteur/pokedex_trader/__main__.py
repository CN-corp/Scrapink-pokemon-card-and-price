"""Ligne de commande : python -m pokedex_trader <commande>"""
import argparse
import sys

import json

from . import analysis, cloud, config, cotes, db, fr, guide, history, ingest, portfolio, reports, server


def _eur(v):
    return "—" if v is None else f"{v:,.2f} €".replace(",", " ")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="pokedex_trader", description="Outil de trading de cartes Pokémon")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="crée la base de données")
    s = sub.add_parser("sync", help="télécharge les prix de toutes les cartes (pokemontcg.io)")
    s.add_argument("--query", help="filtre API, ex. 'set.id:sv8' ou 'name:charizard'")
    s.add_argument("--max-pages", type=int)
    s.add_argument("--budget", type=int, help="secondes max ; la synchro suivante reprend où elle s'est arrêtée")
    co = sub.add_parser("cotes", help="catalogue complet et cotes Cardmarket du jour (TCGdex), EN, JP et FR")
    co.add_argument("--langues", default="en,ja,fr", help="ex. 'en,ja' (défaut : en,ja,fr)")
    co.add_argument("--budget", type=int, help="secondes max ; relancée le même jour, reprend où elle s'est arrêtée")
    co.add_argument("--workers", type=int, default=8)
    sub.add_parser("qualite", help="contrôle : cartes cotées et fraîcheur des cotes par langue")
    sub.add_parser("controle", help="contrôle de complétude : code de sortie 1 si des cotes ont manqué la dernière synchro")
    gu = sub.add_parser("guide", help="cotes du jour depuis le guide de prix officiel Cardmarket (tout ou rien)")
    gu.add_argument("--fichier", help="fichier price_guide_6.json local ou autre URL (défaut : téléchargement Cardmarket)")
    d = sub.add_parser("demo", help="remplit la base avec des données de démonstration")
    d.add_argument("--days", type=int, default=400)

    o = sub.add_parser("opportunites", help="meilleures opportunités d'achat ou de vente")
    o.add_argument("--vente", action="store_true", help="signaux de vente sur le Pokédex")
    o.add_argument("--limit", type=int, default=20)
    o.add_argument("--min-price", type=float)

    for side in ("achat", "vente"):
        t = sub.add_parser(side, help=f"enregistre un(e) {side} dans le Pokédex")
        t.add_argument("card_id")
        t.add_argument("quantite", type=int)
        t.add_argument("prix", type=float, help="prix unitaire en €")
        t.add_argument("--date")
        t.add_argument("--frais", type=float, default=0)
        t.add_argument("--etat", default="NM")
        t.add_argument("--plateforme")
        t.add_argument("--notes")

    sub.add_parser("pokedex", help="positions détenues")
    sub.add_parser("performance", help="performance depuis le jour zéro")
    r = sub.add_parser("rapport", help="rapport mensuel (Markdown dans reports/)")
    r.add_argument("mois", nargs="?", help="AAAA-MM (défaut : tous les mois)")
    c = sub.add_parser("cherche", help="recherche une carte")
    c.add_argument("texte")
    w = sub.add_parser("serve", help="lance le tableau de bord web")
    w.add_argument("--host", default="127.0.0.1")
    w.add_argument("--port", type=int, default=8765)

    ci = sub.add_parser("cloud-import", help="importe les saisies de la page en ligne")
    ci.add_argument("dossier")
    ce = sub.add_parser("cloud-export", help="prépare les documents pour la page en ligne")
    ce.add_argument("dossier")
    cim = sub.add_parser("cloud-images", help="télécharge les illustrations manquantes pour la page")
    cim.add_argument("dossier")
    cim.add_argument("--deja", help="JSON du document app/images déjà en ligne")
    cb = sub.add_parser("cloud-batches", help="lots d'écriture pour la page en ligne")
    cb.add_argument("manifest")
    cb.add_argument("--versions")

    h = sub.add_parser("history", help="prix TCGplayer via tcgcsv.com (relevé quotidien)")
    h.add_argument("action", choices=["map", "load"], help="map : relier les cartes aux produits ; load : relever les prix du jour")
    h.add_argument("--budget", type=int, help="secondes max ; la fois suivante reprend où elle s'est arrêtée")

    sub.add_parser("cartes-fr", help="catalogue des cartes françaises (TCGdex), reliées aux cartes anglaises (rareté)")
    sub.add_parser("purge-conversions", help="retire de la base les prix convertis d'une devise à l'autre (copie de sauvegarde avant)")
    sub.add_parser("purge-cotes-perimees", help="nettoyage ponctuel des faux historiques Cardmarket de pokemontcg.io (sauvegarde avant)")
    sub.add_parser("images-fr", help="scans Poképédia pour les cartes françaises sans illustration TCGdex")
    ps = sub.add_parser("publish-site", help="publie catalogue, analyse et historique sur le site (Supabase)")
    ps.add_argument("--history-days", type=int, help="jours d'historique à (re)envoyer (défaut : 30, ou 365 au premier envoi)")
    ps.add_argument("--dry-run", action="store_true", help="calcule tout sans rien envoyer")
    nw = sub.add_parser("news", help="actualités Pokémon TCG (flux RSS) pour le bandeau du site")
    nw.add_argument("--dry-run", action="store_true", help="affiche les titres sans rien envoyer")

    a = ap.parse_args(argv)
    if a.cmd == "publish-site":  # lecture seule de la base locale : pas de db.init()
        from . import publish_site
        return publish_site.main(history_days=a.history_days, dry_run=a.dry_run)
    if a.cmd == "news":
        from . import news
        return news.main(dry_run=a.dry_run)
    db.init()
    if a.cmd == "init":
        print("Base prête.")
    elif a.cmd == "sync":
        res = ingest.sync(query=a.query, max_pages=a.max_pages, budget=a.budget)
        print(f"Synchro {res['status']} : {res['cards']} cartes, {res['prices']} prix. {res['message']}")
    elif a.cmd == "cotes":
        res = cotes.sync(langs=[x.strip() for x in a.langues.split(",") if x.strip()], budget=a.budget, workers=a.workers)
        print(json.dumps({k: v for k, v in res.items() if k != "errors"} | {"erreurs": len(res["errors"])}, ensure_ascii=False))
    elif a.cmd == "qualite":
        with db.session() as conn:
            print(json.dumps(cotes.freshness(conn), ensure_ascii=False, indent=1))
    elif a.cmd == "controle":
        with db.session() as conn:
            res = cotes.completeness(conn)
        print(json.dumps(res, ensure_ascii=False, indent=1))
        if not res["ok"]:
            sys.exit(1)
    elif a.cmd == "guide":
        if guide.apply(a.fichier)["status"] != "ok":
            sys.exit(1)
    elif a.cmd == "demo":
        ingest.generate_demo(days=a.days)
    elif a.cmd == "cartes-fr":
        print(json.dumps(fr.build(), ensure_ascii=False))
    elif a.cmd == "purge-conversions":
        import shutil
        from datetime import datetime
        bak = config.DB_PATH.with_name(f"{config.DB_PATH.stem}.avant-purge-{datetime.now():%Y%m%d-%H%M%S}{config.DB_PATH.suffix}")
        shutil.copy2(config.DB_PATH, bak)
        print(f"Sauvegarde : {bak}")
        with db.session() as conn:
            db.purge_conversions(conn)
    elif a.cmd == "purge-cotes-perimees":
        import shutil
        from datetime import datetime
        bak = config.DB_PATH.with_name(f"{config.DB_PATH.stem}.avant-purge-cotes-{datetime.now():%Y%m%d-%H%M%S}{config.DB_PATH.suffix}")
        shutil.copy2(config.DB_PATH, bak)
        print(f"Sauvegarde : {bak}")
        with db.session() as conn:
            db.purge_stale_cardmarket(conn)
    elif a.cmd == "images-fr":
        from . import fr_images
        print(json.dumps(fr_images.build(), ensure_ascii=False))
    elif a.cmd == "history":
        if a.action == "map":
            history.build_map()
        else:
            print(json.dumps(history.backfill(budget=a.budget)))
    elif a.cmd == "cloud-import":
        print(json.dumps(cloud.import_inputs(a.dossier), ensure_ascii=False))
    elif a.cmd == "cloud-export":
        m = cloud.export(a.dossier)
        print(f"{len(m['docs'])} documents, {len(m['batches'])} lots -> {a.dossier}/manifest.json")
    elif a.cmd == "cloud-images":
        cloud.fetch_images(a.dossier, a.deja)
    elif a.cmd == "cloud-batches":
        print(json.dumps(cloud.build_batches(a.manifest, a.versions), indent=1))
    elif a.cmd == "serve":
        server.serve(a.host, a.port)
    else:
        with db.session() as conn:
            if a.cmd == "opportunites":
                kind = "sell" if a.vente else "buy"
                for x in analysis.opportunities(conn, kind, a.limit, min_price=a.min_price):
                    why = "; ".join((x["reasons_sell"] if a.vente else x["reasons_buy"])[:2])
                    sc = x["sell_score"] if a.vente else x["buy_score"]
                    print(f"{x['signal']:<11} {sc:5.1f}  {x['name'][:28]:<28} {x['set_name'] or '':<22.22} "
                          f"{_eur(x['price']):>11} → {_eur(x['est30']):>11}  {why}")
            elif a.cmd in ("achat", "vente"):
                side = "buy" if a.cmd == "achat" else "sell"
                portfolio.add_transaction(conn, a.card_id, side, a.quantite, a.prix, a.date, a.frais,
                                          a.etat, platform=a.plateforme, notes=a.notes)
                print(f"{a.cmd.capitalize()} enregistré(e).")
            elif a.cmd == "pokedex":
                pos, _ = portfolio.positions(conn)
                for p in pos:
                    print(f"{p['quantity']:>3} × {p['name'][:30]:<30} PRU {_eur(p['avg_cost']):>10}  "
                          f"cote {_eur(p['price']):>10}  latent {_eur(p['unrealized']):>10} ({p['unrealized_pct'] or 0:+.1f} %)")
            elif a.cmd == "performance":
                for k, v in portfolio.summary(conn).items():
                    print(f"{k:<24} {v}")
            elif a.cmd == "rapport":
                months = [a.mois] if a.mois else portfolio.months_available(conn)
                for m in months:
                    p = reports.export_month(conn, m)
                    print(f"{m} → {p}")
            elif a.cmd == "cherche":
                for x in server._search(conn, a.texte):
                    print(f"{x['id']:<18} {x['name'][:30]:<30} {x['set_name'] or '':<25.25} {_eur(x['price'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
