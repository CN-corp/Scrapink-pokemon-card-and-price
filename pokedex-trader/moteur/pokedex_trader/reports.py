"""Export des rapports mensuels en Markdown."""
from . import analysis, config, portfolio


def _eur(v):
    return "—" if v is None else f"{v:,.2f} €".replace(",", " ")


def _pct(v):
    return "—" if v is None else f"{v:+.2f} %"


def render_month(conn, month):
    r = portfolio.monthly_report(conn, month)
    if not r:
        return None
    lines = [
        f"# Rapport mensuel Pokédex — {month}",
        "",
        f"Période : {r['period'][0]} → {r['period'][1]}",
        "",
        "## Synthèse du mois",
        "",
        "| Indicateur | Valeur |",
        "|---|---|",
        f"| Valeur des cartes en début de mois | {_eur(r['value_start'])} |",
        f"| Valeur des cartes en fin de mois | {_eur(r['value_end'])} |",
        f"| Achats ({r['n_buys']} cartes) | {_eur(r['bought'])} |",
        f"| Ventes ({r['n_sells']} cartes, net de frais) | {_eur(r['sold'])} |",
        f"| Plus-values réalisées | {_eur(r['realized_pnl'])} |",
        f"| Variation latente | {_eur(r['unrealized_change'])} |",
        f"| **Résultat du mois** | **{_eur(r['pnl_month'])}** |",
        f"| Performance du mois (time-weighted) | {_pct(r['twr_month_pct'])} |",
        "",
        "## Depuis le jour zéro",
        "",
        f"- Résultat cumulé : **{_eur(r['pnl_since_day_zero'])}**",
        f"- ROI sur capital investi : {_pct(r['roi_since_day_zero_pct'])}",
        f"- Performance time-weighted : {_pct(r['twr_since_day_zero_pct'])}",
        "",
    ]
    if r["best_trades"]:
        lines += ["## Meilleures ventes du mois", "", "| Carte | Qté | Prix de revient | Encaissé net | P&L | Détention |", "|---|---|---|---|---|---|"]
        for t in r["best_trades"]:
            lines.append(f"| {t['name']} ({t['card_id']}) | {t['quantity']} | {_eur(t['cost'])} | {_eur(t['proceeds'])} | "
                         f"{_eur(t['pnl'])} ({(t['pnl_pct'] or 0):+.0f} %) | {t['avg_hold_days']} j |")
        lines.append("")
    if r["transactions"]:
        lines += ["## Mouvements", "", "| Date | Sens | Carte | Qté | Prix unitaire | Frais |", "|---|---|---|---|---|---|"]
        for t in r["transactions"]:
            side = "Achat" if t["side"] == "buy" else "Vente"
            lines.append(f"| {t['date']} | {side} | {t['name']} | {t['quantity']} | {_eur(t['unit_price'])} | {_eur(t['fees'])} |")
        lines.append("")

    sells = analysis.opportunities(conn, "sell", limit=5)
    buys = analysis.opportunities(conn, "buy", limit=10)
    lines += ["## Conseils à date (Pokédex)", ""]
    for s in sells:
        why = "; ".join(s["reasons_sell"][:3]) or "—"
        lines.append(f"- **{s['signal']}** {s['name']} — {s['owned_qty']} ex., {_eur(s['price'])}, "
                     f"gain net {s['gain_net_pct']:+.0f} % — {why}")
    lines += ["", "## Opportunités d'achat", ""]
    for b in buys:
        why = "; ".join(b["reasons_buy"][:3]) or "—"
        lines.append(f"- **{b['signal']}** {b['name']} ({b['set_name']}) — {_eur(b['price'])} → estimé {_eur(b['est30'])} "
                     f"à 30 j — score {b['buy_score']:.0f} — {why}")
    lines += ["", "_Estimations statistiques, pas un conseil financier. Frais de revente pris en compte : "
              f"{config.SELL_FEE_PCT*100:.0f} % + {config.SELL_FIXED_FEE:.2f} €._", ""]
    return "\n".join(lines)


def export_month(conn, month):
    text = render_month(conn, month)
    if text is None:
        return None
    config.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = config.REPORTS_DIR / f"rapport_{month}.md"
    path.write_text(text, encoding="utf-8")
    return path
