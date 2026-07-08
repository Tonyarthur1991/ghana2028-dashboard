"""
News scraper — pulls political articles from Ghanaian news RSS feeds and
extracts clean article text via trafilatura. This module is fully functional
(no gated API needed), so it's the fastest way to get real data flowing in
Phase 0/1 while X and Meta access applications are pending.

Usage:
    python -m ingestion.news_scraper --once      # single run
    python -m ingestion.news_scraper --daemon    # loop on settings interval
"""
import argparse
import hashlib
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator

import feedparser
import trafilatura
import yaml
from sqlalchemy import create_engine, text

import os
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("news_scraper")

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "gazetteer.yaml")
SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "settings.yaml")


@dataclass
class ScrapedArticle:
    source_name: str
    url: str
    published_at: datetime
    text: str

    def text_hash(self) -> str:
        return hashlib.sha256(self.text.encode("utf-8")).hexdigest()

    def post_id(self) -> str:
        return hashlib.sha256(self.url.encode("utf-8")).hexdigest()[:32]


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_settings() -> dict:
    with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def is_politically_relevant(text: str, gazetteer: dict) -> bool:
    """Cheap keyword pre-filter before the full NER/sentiment pipeline runs.
    Not a substitute for nlp/ner_pipeline.py — this just avoids wasting model
    inference on obviously irrelevant articles (sport, entertainment, etc.)."""
    haystack = text.lower()
    terms = []
    for party in gazetteer["parties"]:
        terms.extend(a.lower() for a in party["aliases"])
    for bloc in gazetteer["candidates"].values():
        for c in bloc:
            terms.extend(a.lower() for a in c["aliases"])
    for issue_terms in gazetteer["issues"].values():
        terms.extend(t.lower() for t in issue_terms)
    return any(term in haystack for term in terms)


def fetch_feed(source_name: str, rss_url: str) -> Iterator[ScrapedArticle]:
    parsed = feedparser.parse(rss_url)
    if parsed.bozo:
        logger.warning("Feed parse issue for %s (%s): %s", source_name, rss_url, parsed.bozo_exception)
    for entry in parsed.entries:
        url = entry.get("link")
        if not url:
            continue
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            logger.debug("Could not fetch %s", url)
            continue
        extracted = trafilatura.extract(downloaded)
        if not extracted:
            continue
        published_struct = entry.get("published_parsed") or entry.get("updated_parsed")
        published_at = (
            datetime(*published_struct[:6], tzinfo=timezone.utc)
            if published_struct
            else datetime.now(timezone.utc)
        )
        yield ScrapedArticle(source_name=source_name, url=url, published_at=published_at, text=extracted)


def persist(article: ScrapedArticle, engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO raw_posts (post_id, platform, posted_at, raw_text_hash, source_url)
                VALUES (:post_id, 'news', :posted_at, :text_hash, :url)
                ON CONFLICT DO NOTHING
                """
            ),
            {
                "post_id": article.post_id(),
                "posted_at": article.published_at,
                "text_hash": article.text_hash(),
                "url": article.url,
            },
        )


def run_once() -> int:
    gazetteer = load_config()
    engine = create_engine(os.getenv("DATABASE_URL", "postgresql://localhost/ghana2028"))
    total_relevant = 0
    for source in gazetteer["news_sources"]:
        logger.info("Scraping %s", source["name"])
        try:
            for article in fetch_feed(source["name"], source["rss"]):
                if is_politically_relevant(article.text, gazetteer):
                    persist(article, engine)
                    total_relevant += 1
        except Exception as exc:  # noqa: BLE001 — log and continue, one bad feed shouldn't kill the run
            logger.error("Failed to scrape %s: %s", source["name"], exc)
    logger.info("Persisted %d politically-relevant articles", total_relevant)
    return total_relevant


def run_daemon() -> None:
    settings = load_settings()
    interval_seconds = settings["ingestion"]["news_scrape_interval_hours"] * 3600
    while True:
        run_once()
        time.sleep(interval_seconds)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--once", action="store_true")
    group.add_argument("--daemon", action="store_true")
    args = parser.parse_args()
    run_daemon() if args.daemon else run_once()
