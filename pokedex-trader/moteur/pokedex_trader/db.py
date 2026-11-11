"""Base SQLite : référentiel des cartes, historique des prix, Pokédex (transactions)."""
import sqlite3
from contextlib import contextmanager

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY,
    name TEXT,
    series TEXT,
    release_date TEXT,
    total INTEGER
);

CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    set_id TEXT,
    set_name TEXT,
    number TEXT,
    rarity TEXT,
    supertype TEXT,
    image_small TEXT,
    image_large TEXT,
    release_date TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_set ON cards(set_id);

-- Un relevé par carte / jour / source / variante.
-- price = prix dans la devise de son marché (currency) : EUR pour Cardmarket et les prix saisis,
-- USD pour TCGplayer (marché américain). Jamais converti d'une devise à l'autre.
CREATE TABLE IF NOT EXISTS prices (
    card_id TEXT NOT NULL,
    date TEXT NOT NULL,
    source TEXT NOT NULL,          -- 'cardmarket' | 'tcgplayer' | 'tcghist' (archives) | 'manual' | 'demo'
    variant TEXT NOT NULL DEFAULT 'normal',
    price REAL,
    low REAL,
    high REAL,
    avg1 REAL,
    avg7 REAL,
    avg30 REAL,
    currency TEXT DEFAULT 'EUR',
    PRIMARY KEY (card_id, date, source, variant)
);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(date);

-- Le Pokédex : chaque achat et chaque vente
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    date TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0,
    condition TEXT DEFAULT 'NM',
    language TEXT DEFAULT 'FR',
    platform TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tx_card ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);

-- Objectifs de prix personnels (optionnel) par carte
CREATE TABLE IF NOT EXISTS targets (
    card_id TEXT PRIMARY KEY,
    buy_below REAL,
    sell_above REAL
);

-- Correspondance carte <-> produit TCGplayer (archives de prix tcgcsv.com)
CREATE TABLE IF NOT EXISTS tcg_map (
    card_id TEXT PRIMARY KEY,
    product_id INTEGER NOT NULL,
    category INTEGER NOT NULL,
    group_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tcg_map_product ON tcg_map(product_id);

-- Correspondance carte <-> produit Cardmarket (idProduct relevé par TCGdex) : sert à lire le guide de prix
-- officiel de Cardmarket (guide.py) sans repasser par TCGdex
CREATE TABLE IF NOT EXISTS cm_map (
    card_id TEXT PRIMARY KEY,
    id_product INTEGER NOT NULL,
    lang TEXT
);
CREATE INDEX IF NOT EXISTS idx_cm_map_product ON cm_map(id_product);

CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT,
    finished_at TEXT,
    source TEXT,
    cards INTEGER,
    prices INTEGER,
    status TEXT,
    message TEXT
);
"""


def connect(path=None):
    path = path or config.DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def session(path=None):
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init(path=None):
    with session(path) as conn:
        conn.executescript(SCHEMA)
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(cards)")}
        if "last_price" not in cols:
            conn.execute("ALTER TABLE cards ADD COLUMN last_price REAL")
        if "last_price_date" not in cols:
            conn.execute("ALTER TABLE cards ADD COLUMN last_price_date TEXT")
        if "lang" not in cols:
            conn.execute("ALTER TABLE cards ADD COLUMN lang TEXT DEFAULT 'EN'")
        if "ref_id" not in cols:  # carte française -> même carte du catalogue anglais
            conn.execute("ALTER TABLE cards ADD COLUMN ref_id TEXT")
        # Doublon de la clé primaire (card_id, date, source, variant) : ne fait que grossir la base
        conn.execute("DROP INDEX IF EXISTS idx_prices_card_date")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_cards_lang_set ON cards(lang, set_id)")


# Sources en euros qui forment la cote d'une carte. TCGplayer ('tcgplayer', 'tcghist') est le marché
# américain, en dollars : il n'entre jamais dans la série en euros (ni converti, ni recalé).
EUR_SOURCES = ("cardmarket", "manual", "demo")


def splice(rows):
    """Série en euros d'une carte à partir de ses propres relevés (date, source, variante, prix) :
    Cardmarket (variante normale) et les prix saisis à la main. Renvoie {date: (source, prix)}."""
    out = {}
    for d, src, var, p in rows:
        if p and src in EUR_SOURCES and (src == "manual" or (var or "normal") == "normal"):
            if src == "manual" or d not in out or out[d][0] != "manual":
                out[d] = (src, p)
    return out


def refresh_fr_prices(conn):
    """Cote des cartes françaises : leur dernier prix français saisi, ou, si config.FR_CARDMARKET, la cote
    Cardmarket de leur propre produit (toutes langues confondues, relevée sur la carte FR elle-même par
    cotes.py) ; jamais la cote de la carte anglaise."""
    srcs = "('manual','cardmarket')" if config.FR_CARDMARKET else "('manual')"
    pick = f"""FROM prices p WHERE p.card_id=cards.id AND p.source IN {srcs} AND (p.variant='normal' OR p.source='manual')
               ORDER BY date DESC, CASE source WHEN 'manual' THEN 0 ELSE 1 END LIMIT 1"""
    conn.execute(f"UPDATE cards SET last_price = (SELECT price {pick}), last_price_date = (SELECT date {pick}) WHERE lang='FR'")


def purge_conversions(conn, log=print):
    """Nettoie une base remplie avant la règle « aucune conversion » : supprime les relevés TCGplayer
    enregistrés convertis en euros (ils se retéléchargent en dollars) et recalcule chaque cote à partir des
    seules sources en euros de la carte elle-même."""
    n = conn.execute("DELETE FROM prices WHERE source IN ('tcgplayer', 'tcghist') AND COALESCE(currency, 'EUR') = 'EUR'").rowcount
    conn.execute("""UPDATE cards SET
          last_price = (SELECT price FROM prices p WHERE p.card_id=cards.id AND p.source IN ('cardmarket','manual','demo')
                          AND (p.variant='normal' OR p.source='manual') ORDER BY date DESC, CASE source WHEN 'cardmarket' THEN 0 ELSE 1 END LIMIT 1),
          last_price_date = (SELECT date FROM prices p WHERE p.card_id=cards.id AND p.source IN ('cardmarket','manual','demo')
                          AND (p.variant='normal' OR p.source='manual') ORDER BY date DESC, CASE source WHEN 'cardmarket' THEN 0 ELSE 1 END LIMIT 1)""")
    refresh_fr_prices(conn)
    conn.commit()
    left = conn.execute("SELECT COALESCE(lang,'EN') l, COUNT(*) n, SUM(last_price IS NOT NULL) p FROM cards GROUP BY l").fetchall()
    log(f"Relevés convertis supprimés : {n}. Cartes cotées en euros : " + ", ".join(f"{r['l']} {r['p'] or 0}/{r['n']}" for r in left))
    return n


def purge_stale_cardmarket(conn, log=print):
    """Nettoyage ponctuel (2026-10-23) : du 18 au 23 octobre 2026, la synchro pokemontcg.io a enregistré chaque jour
    un bloc Cardmarket périmé (mis à jour entre novembre 2025 et juillet 2026) daté du jour du relevé : un même vieux
    prix répété, donc un faux historique. Supprime ces lignes ; les lignes TCGdex (cotes.py, datées par
    Cardmarket) les remplacent. Puis recalcule la cote de chaque carte à partir de ce qui reste."""
    # Le 22, les lignes TCGdex ont remplacé celles de pokemontcg.io (même clé) ; les autres jours n'ont que du périmé
    n = conn.execute("""DELETE FROM prices WHERE source='cardmarket'
                        AND date IN ('2026-10-18','2026-10-19','2026-10-20','2026-10-21','2026-10-23')""").rowcount
    conn.execute("""UPDATE cards SET
          last_price = (SELECT price FROM prices p WHERE p.card_id=cards.id AND p.source IN ('cardmarket','manual','demo')
                          AND (p.variant='normal' OR p.source='manual') ORDER BY date DESC, CASE source WHEN 'cardmarket' THEN 0 ELSE 1 END LIMIT 1),
          last_price_date = (SELECT date FROM prices p WHERE p.card_id=cards.id AND p.source IN ('cardmarket','manual','demo')
                          AND (p.variant='normal' OR p.source='manual') ORDER BY date DESC, CASE source WHEN 'cardmarket' THEN 0 ELSE 1 END LIMIT 1)
        WHERE COALESCE(lang,'EN') <> 'FR'""")
    refresh_fr_prices(conn)
    conn.commit()
    log(f"Relevés Cardmarket périmés supprimés : {n}")
    return n


def price_series(conn, card_id, days=None):
    """Série de prix (EUR) de la carte elle-même : jamais celle d'une autre langue, jamais en dollars."""
    q = "SELECT date, source, variant, price FROM prices WHERE card_id = ? AND price IS NOT NULL"
    args = [card_id]
    if days:
        q += " AND date >= date('now', ?)"
        args.append(f"-{int(days)} days")
    rows = [(r["date"], r["source"], r["variant"], r["price"]) for r in conn.execute(q, args)]
    return [(d, v[1]) for d, v in sorted(splice(rows).items())]


def latest_price(conn, card_id, on_date=None):
    q = """
        SELECT date, source, price, avg1, avg7, avg30, low FROM prices
        WHERE card_id = ? AND price IS NOT NULL AND source IN ('cardmarket', 'manual', 'demo')
    """
    args = [card_id]
    if on_date:
        q += " AND date <= ?"
        args.append(on_date)
    q += """ ORDER BY date DESC,
             CASE source WHEN 'cardmarket' THEN 0 WHEN 'manual' THEN 1 ELSE 2 END
             LIMIT 1"""
    r = conn.execute(q, args).fetchone()
    return dict(r) if r else None
