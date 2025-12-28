# Scrapink PokéCardex scraper

Ce dépôt fournit un petit outil en Python pour aspirer les informations publiques des cartes PokéCardex (nom, prix, URL d'illustration) et les exporter en CSV ou directement vers un onglet Google Sheets.

> ⚠️ Respecte toujours les conditions d'utilisation et la charge du site cible. Adapte éventuellement les sélecteurs si le HTML change.

## Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Utilisation rapide

Extraction en CSV seule :

```bash
python scrape_pokecardex.py --url https://www.pokecardex.com/collection/show \
  --output-csv cards.csv
```

Avec export vers Google Sheets (service account JSON requis) :

```bash
python scrape_pokecardex.py --url https://www.pokecardex.com/collection/show \
  --output-csv cards.csv \
  --google-sheet-id VOTRE_SPREADSHEET_ID \
  --worksheet "Cartes" \
  --service-account ./credentials.json
```

Paramètres utiles :

- `--delay` : délai entre pages (1 s par défaut) pour ménager le site.
- `--max-pages` : limite de pages à parcourir.
- `--card-selector`, `--name-selector`, `--price-selector`, `--image-selector`, `--next-selector` : sélecteurs CSS pour s'adapter si la structure HTML évolue.

## Flux vers Google Sheets

1. Crée un compte de service dans Google Cloud et exporte les identifiants JSON.
2. Partage la feuille cible avec l'adresse du compte de service.
3. Passe l'ID du tableur via `--google-sheet-id` et le chemin du JSON via `--service-account`.
4. L'outil vide l'onglet ciblé puis pousse l'entête `name`, `price`, `image_url` suivi des données.

## Export CSV

Le CSV généré contient trois colonnes : `name`, `price` (nombre ou vide) et `image_url`. Tu peux ensuite l'importer dans Google Sheets via **Fichier > Importer**.

## Bonnes pratiques de scraping

- Consulte `robots.txt` et les CGU du site.
- Ajoute éventuellement un proxy de cache et un délai plus long si tu fais des extractions fréquentes.
- Préfère l'API officielle si elle existe.
