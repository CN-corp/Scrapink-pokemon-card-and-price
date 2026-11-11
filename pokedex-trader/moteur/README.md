# Pokédex Trader

> Note (11/11/2026) : la synchro quotidienne passe désormais par `cotes` (TCGdex, cotes Cardmarket en €), `guide`, `history` et `publish-site` ; voir `../DEPLOIEMENT.md`. La commande `sync` (pokemontcg.io) n'est plus utilisée au quotidien. Aucune conversion de devises : chaque marché garde sa devise.

Outil de trading dédié aux cartes Pokémon : prix de toutes les cartes avec historique, analyse et signaux d'achat / vente, espace **Pokédex** (cartes achetées et vendues), performance depuis le jour zéro et rapports mensuels.

Python 3.9+ uniquement, **aucune dépendance à installer** (SQLite et serveur web de la bibliothèque standard).

## Démarrage rapide

```bash
cd pokemon-trading
python -m pokedex_trader demo      # facultatif : données fictives pour découvrir l'outil
python -m pokedex_trader serve     # puis ouvrir http://127.0.0.1:8765
```

Pour passer aux vraies données, supprimez `data/pokemon_trading.db` (si vous avez lancé la démo) puis :

```bash
python -m pokedex_trader sync      # toutes les cartes (~20 000), Cardmarket + TCGPlayer
```

Sans clé, l'API autorise 1 000 requêtes / jour (une synchro complète en consomme ~80). Une clé gratuite sur <https://dev.pokemontcg.io> monte la limite et accélère la synchro :

```bash
export POKEMONTCG_API_KEY=votre_cle        # Windows : set POKEMONTCG_API_KEY=votre_cle
```

## Sources de prix

| Source | Ce qu'on récupère | Devise |
|---|---|---|
| **pokemontcg.io** (API publique) | référentiel complet des cartes, images, extensions | — |
| ↳ **Cardmarket** (via l'API) | prix tendance, prix plancher, moyennes 1 / 7 / 30 jours, reverse holo | EUR |
| ↳ **TCGPlayer** (via l'API) | prix market / low / high par variante (holo, reverse, 1st edition…) | USD (jamais converti) |
| Relevé manuel | un prix constaté ailleurs (eBay, Vinted, boutique) | EUR |

On passe par l'API plutôt que par du scraping HTML : c'est stable, légal, et ça couvre l'intégralité des cartes. **Lancez `sync` une fois par jour** : chaque synchro ajoute un point d'historique, et les indicateurs gagnent en précision avec le temps. Dès le premier jour, l'analyse utilise déjà les moyennes 1/7/30 j de Cardmarket.

Planifier la synchro quotidienne :

- Linux / macOS (`crontab -e`) : `15 7 * * * cd /chemin/pokemon-trading && python3 -m pokedex_trader sync >> data/sync.log 2>&1`
- Windows : Planificateur de tâches → action `python -m pokedex_trader sync`, dossier de départ `pokemon-trading`.

## Ce que calcule l'analyse

Pour chaque carte cotée au-dessus du prix mini (3 € par défaut) :

- **Momentum** 7 / 30 / 90 jours, moyennes mobiles 30 / 90 jours, **z-score** (écart à la normale), **RSI 14**, **volatilité** mensuelle, distance au plus haut sur 1 an.
- **Tendance** : régression du log-prix sur 90 jours, pondérée par sa fiabilité (R²).
- **Estimation à 30 et 90 jours** avec fourchette (± volatilité), et **gain espéré net des frais de revente** (5 % + 1,20 € par défaut).
- **Décotes** : offres sous le prix tendance, et écart Cardmarket / TCGPlayer (arbitrage).
- **Score d'achat et score de vente** (0–100) avec les raisons en clair.

Signaux : `ACHAT FORT`, `ACHAT`, `NEUTRE`, `ÉVITER` pour le marché ; `RENFORCER`, `CONSERVER`, `ALLÉGER`, `VENDRE` pour vos cartes.

### Conseils croisés avec le Pokédex

- plus-value nette importante + signaux de retournement → prise de bénéfices conseillée ;
- perte et tendance baissière installée → alerte « couper la position » ;
- carte qui pèse trop lourd dans le portefeuille (> 15 %) → on déconseille d'en racheter ;
- objectifs personnels par carte (« acheter sous X € », « vendre au-dessus de Y € ») pris en compte.

## Pokédex, performance et rapports

- Chaque achat / vente est saisi avec quantité, prix, frais, état (NM, PSA 10…), plateforme.
- Plus-values calculées en **FIFO** (premier acheté, premier vendu), durée de détention incluse.
- **Performance depuis le jour zéro** (premier achat) : capital investi, encaissé, valeur actuelle, valeur nette si tout était vendu, ROI, performance *time-weighted* (neutre aux apports d'argent), drawdown max, taux de réussite.
- **Rapport mensuel** : valeur début / fin, achats, ventes, réalisé, latent, résultat du mois, meilleures ventes, conseils à date. Export Markdown dans `reports/`.

## Ligne de commande

```bash
python -m pokedex_trader cherche "charizard"                  # trouver l'identifiant d'une carte
python -m pokedex_trader achat sv3pt5-199 1 115 --frais 3 --plateforme Cardmarket
python -m pokedex_trader vente sv3pt5-199 1 160 --frais 9.2
python -m pokedex_trader opportunites --limit 30               # meilleurs achats
python -m pokedex_trader opportunites --vente                  # que vendre dans mon Pokédex
python -m pokedex_trader pokedex
python -m pokedex_trader performance
python -m pokedex_trader rapport 2026-10                       # sans mois : tous les mois
python -m pokedex_trader sync --query "set.id:sv8"             # synchro d'une seule extension
```

## Réglages (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `POKEMONTCG_API_KEY` | vide | clé API pokemontcg.io |
| `PTRADER_USD_EUR` | 0.92 | taux de conversion des prix TCGPlayer |
| `PTRADER_SELL_FEE_PCT` | 0.05 | commission de revente |
| `PTRADER_SELL_FIXED_FEE` | 1.20 | frais fixes par vente (port…) |
| `PTRADER_MIN_PRICE` | 3 | prix mini pour apparaître dans les opportunités |
| `PTRADER_MAX_WEIGHT` | 0.15 | poids max d'une carte dans le portefeuille |
| `PTRADER_DB` | `data/pokemon_trading.db` | emplacement de la base |

## Structure

```
pokedex_trader/
  ingest.py     synchro des prix (API) + données de démo
  analysis.py   indicateurs, estimations, scores et signaux
  portfolio.py  Pokédex, FIFO, courbe de performance, rapport mensuel
  reports.py    export Markdown
  server.py     API JSON + tableau de bord
  db.py         schéma SQLite
static/index.html  tableau de bord (Marché, Pokédex, Performance, Rapports, Données)
```

_Les estimations sont statistiques et ne garantissent rien : le marché des cartes réagit aussi aux rééditions, aux annonces et aux tournois._
