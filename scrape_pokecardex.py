"""Scrape card data (name, price, illustration) from PokéCardex.

Usage example:
    python scrape_pokecardex.py --url https://www.pokecardex.com/collection/show \
        --output-csv cards.csv --google-sheet-id <id> --worksheet "Cartes"

Selectors default to values that match the current PokéCardex HTML structure but can be
overridden through CLI arguments if the markup changes.
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import re
import time
from typing import Iterable, List, Optional

import requests
from bs4 import BeautifulSoup

try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:  # pragma: no cover - optional dependency for Google Sheets
    gspread = None
    Credentials = None


@dataclasses.dataclass
class Card:
    """Card information extracted from a collection page."""

    name: str
    price: Optional[float]
    image_url: str


@dataclasses.dataclass
class Selectors:
    """CSS selectors for locating elements on PokéCardex pages."""

    card: str = "div.card"  # container for a single card
    name: str = ".card__title"
    price: str = ".card__price"
    image: str = "img.card__image"
    next_page: str = "a[rel='next']"


HEADERS = {
    "User-Agent": "Scrapink card scraper (github.com)",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}


def normalize_price(raw: str) -> Optional[float]:
    cleaned = raw.replace("€", "").replace("\xa0", " ").strip()
    cleaned = cleaned.replace(",", ".")
    match = re.search(r"(-?\d+(?:\.\d+)?)", cleaned)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def extract_text(node: BeautifulSoup, selector: str) -> str:
    target = node.select_one(selector)
    if not target:
        return ""
    return target.get_text(strip=True)


def extract_image(node: BeautifulSoup, selector: str) -> str:
    target = node.select_one(selector)
    if not target:
        return ""
    return target.get("src") or target.get("data-src") or ""


def parse_cards(soup: BeautifulSoup, selectors: Selectors) -> List[Card]:
    cards: List[Card] = []
    for card_node in soup.select(selectors.card):
        name = extract_text(card_node, selectors.name)
        price_text = extract_text(card_node, selectors.price)
        image_url = extract_image(card_node, selectors.image)
        cards.append(Card(name=name, price=normalize_price(price_text), image_url=image_url))
    return cards


def find_next_page(soup: BeautifulSoup, selectors: Selectors) -> Optional[str]:
    link = soup.select_one(selectors.next_page)
    if link:
        href = link.get("href")
        if href:
            return href
    return None


def fetch_cards(url: str, selectors: Selectors, delay: float, max_pages: Optional[int]) -> List[Card]:
    session = requests.Session()
    session.headers.update(HEADERS)
    collected: List[Card] = []
    pages_seen = 0
    next_url = url

    while next_url:
        response = session.get(next_url, timeout=20)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        collected.extend(parse_cards(soup, selectors))
        pages_seen += 1
        if max_pages and pages_seen >= max_pages:
            break
        next_url = find_next_page(soup, selectors)
        if next_url:
            time.sleep(delay)
    return collected


def write_csv(cards: Iterable[Card], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["name", "price", "image_url"])
        for card in cards:
            writer.writerow([card.name, card.price if card.price is not None else "", card.image_url])


def push_to_google_sheet(cards: Iterable[Card], spreadsheet_id: str, worksheet: str, credentials_path: str) -> None:
    if gspread is None or Credentials is None:
        raise RuntimeError("gspread and google-auth are required for Google Sheets export. Install them first.")
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    credentials = Credentials.from_service_account_file(credentials_path, scopes=scopes)
    client = gspread.authorize(credentials)
    sheet = client.open_by_key(spreadsheet_id)
    ws = sheet.worksheet(worksheet)
    rows = [[card.name, card.price if card.price is not None else "", card.image_url] for card in cards]
    ws.clear()
    ws.append_rows([["name", "price", "image_url"]] + rows, value_input_option="USER_ENTERED")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Scrape PokéCardex cards into CSV or Google Sheets.")
    parser.add_argument("--url", default="https://www.pokecardex.com/collection/show", help="Collection page URL to scrape.")
    parser.add_argument("--output-csv", default="cards.csv", help="Path to write CSV output.")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds to wait between pages to reduce load.")
    parser.add_argument("--max-pages", type=int, default=None, help="Maximum number of pages to scrape (default: all).")

    parser.add_argument("--card-selector", default=Selectors.card, help="CSS selector for individual card containers.")
    parser.add_argument("--name-selector", default=Selectors.name, help="CSS selector for the card title element.")
    parser.add_argument("--price-selector", default=Selectors.price, help="CSS selector for the card price element.")
    parser.add_argument("--image-selector", default=Selectors.image, help="CSS selector for the card image element.")
    parser.add_argument("--next-selector", default=Selectors.next_page, help="CSS selector for the pagination link to the next page.")

    parser.add_argument("--google-sheet-id", help="Google Sheets spreadsheet ID (optional).")
    parser.add_argument("--worksheet", default="Cartes", help="Worksheet title when exporting to Google Sheets.")
    parser.add_argument(
        "--service-account", help="Path to Google service account JSON credentials (required for Google Sheets export)."
    )
    return parser


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    selectors = Selectors(
        card=args.card_selector,
        name=args.name_selector,
        price=args.price_selector,
        image=args.image_selector,
        next_page=args.next_selector,
    )

    cards = fetch_cards(args.url, selectors, delay=args.delay, max_pages=args.max_pages)
    write_csv(cards, args.output_csv)
    print(f"Wrote {len(cards)} cards to {args.output_csv}")

    if args.google_sheet_id:
        if not args.service_account:
            raise SystemExit("--service-account is required when --google-sheet-id is provided")
        push_to_google_sheet(cards, args.google_sheet_id, args.worksheet, args.service_account)
        print(f"Uploaded {len(cards)} cards to Google Sheet {args.google_sheet_id} ({args.worksheet})")


if __name__ == "__main__":
    main()
