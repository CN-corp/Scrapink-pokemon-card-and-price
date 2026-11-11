"""Configuration de l'outil. Tout est surchargeable par variables d'environnement."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("PTRADER_DB", ROOT / "data" / "pokemon_trading.db"))
REPORTS_DIR = Path(os.environ.get("PTRADER_REPORTS", ROOT / "reports"))
STATIC_DIR = ROOT / "static"

# Clé gratuite sur https://dev.pokemontcg.io (20 000 requêtes/jour au lieu de 1 000)
POKEMONTCG_API_KEY = os.environ.get("POKEMONTCG_API_KEY", "")
POKEMONTCG_URL = "https://api.pokemontcg.io/v2"

# Chaque marché garde sa devise et sa cote : la cote d'une carte est sa cote Cardmarket en euros (ou le prix
# saisi pour elle). Les prix TCGplayer (marché américain) restent en dollars et ne deviennent jamais une cote
# en euros ; une carte française ou japonaise ne reprend jamais la cote d'une carte anglaise. Aucune conversion.

# Frais de revente estimés (commission Cardmarket ~5 % + frais de port moyens)
SELL_FEE_PCT = float(os.environ.get("PTRADER_SELL_FEE_PCT", "0.05"))
SELL_FIXED_FEE = float(os.environ.get("PTRADER_SELL_FIXED_FEE", "1.20"))

# On ignore les cartes trop peu chères pour être rentables après frais
MIN_TRADE_PRICE = float(os.environ.get("PTRADER_MIN_PRICE", "50"))

# Historique de prix conservé seulement pour les cartes à partir de ce prix (et celles du Pokédex).
# Les autres gardent leur dernière cote, pour la recherche et la valorisation.
HISTORY_MIN_PRICE = float(os.environ.get("PTRADER_HISTORY_MIN", "50"))

# Historique pour toutes les cartes : sous ce prix, une nouvelle ligne n'est écrite que si la cote a changé
# (cotes.py) ; au-dessus, et pour les cartes du Pokédex, une ligne par jour.
DAILY_MIN_PRICE = float(os.environ.get("PTRADER_DAILY_MIN", "5"))

# Cartes françaises : sur Cardmarket, la carte FR et la carte EN sont le même produit (cote toutes langues
# confondues). 1 = afficher cette cote sur les cartes FR, présentée comme « Cardmarket · toutes langues ».
FR_CARDMARKET = os.environ.get("PTRADER_FR_CARDMARKET", "0") == "1"

# Part maximale d'une seule carte dans le portefeuille avant de déconseiller d'en racheter
MAX_POSITION_WEIGHT = float(os.environ.get("PTRADER_MAX_WEIGHT", "0.15"))
