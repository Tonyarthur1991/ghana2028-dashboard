"""
X (Twitter) API v2 filtered-stream client. Gated behind X_BEARER_TOKEN — apply
for at least Basic/Pro tier access before this module can run for real
(free tier's stream volume caps make it unusable for this project).

Design note: this is the highest-representativeness-risk source (only ~3.3%
of Ghana's population reached on X per DataReportal Digital 2026), so it is
intentionally the *first* source built, not the primary one relied upon —
news_scraper.py and the eventual Meta Content Library integration matter more
for representativeness. Build this now because API approval has long lead time.

Usage:
    python -m ingestion.x_stream --setup-rules   # (re)configure filtered stream rules
    python -m ingestion.x_stream --run           # connect and stream
"""
import hashlib
import logging
import os
from datetime import datetime, timezone

import tweepy
import yaml
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("x_stream")

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "gazetteer.yaml")


def load_gazetteer() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_stream_rules(gazetteer: dict) -> list[str]:
    """Builds X API filtered-stream rule strings from the gazetteer.
    X limits rule length to 512 chars each and caps total rule count by tier —
    chunk aliases into multiple OR-groups rather than one giant rule."""
    all_terms = []
    for party in gazetteer["parties"]:
        all_terms.extend(party["aliases"])
    for bloc in gazetteer["candidates"].values():
        for c in bloc:
            all_terms.extend(c["aliases"])

    rules = []
    chunk: list[str] = []
    chunk_len = 0
    for term in all_terms:
        quoted = f'"{term}"'
        if chunk_len + len(quoted) + 4 > 500:  # leave headroom for " OR " joins + place_country
            rules.append(" OR ".join(chunk) + " lang:en OR lang:und place_country:GH")
            chunk, chunk_len = [], 0
        chunk.append(quoted)
        chunk_len += len(quoted) + 4
    if chunk:
        rules.append(" OR ".join(chunk))
    return rules


class GhanaPoliticsStream(tweepy.StreamingClient):
    def __init__(self, bearer_token: str, engine):
        super().__init__(bearer_token)
        self.engine = engine

    def on_tweet(self, tweet: tweepy.Tweet) -> None:
        text_hash = hashlib.sha256(tweet.text.encode("utf-8")).hexdigest()
        author_hash = hashlib.sha256(str(tweet.author_id).encode("utf-8")).hexdigest()
        with self.engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO raw_posts (post_id, platform, posted_at, author_hash, raw_text_hash)
                    VALUES (:post_id, 'x', :posted_at, :author_hash, :text_hash)
                    ON CONFLICT DO NOTHING
                    """
                ),
                {
                    "post_id": str(tweet.id),
                    "posted_at": tweet.created_at or datetime.now(timezone.utc),
                    "author_hash": author_hash,
                    "text_hash": text_hash,
                },
            )

    def on_errors(self, errors) -> None:
        logger.error("Stream error: %s", errors)

    def on_connection_error(self) -> None:
        logger.error("Stream connection error — tweepy will handle reconnect backoff")


def setup_rules(bearer_token: str) -> None:
    client = tweepy.StreamingClient(bearer_token)
    existing = client.get_rules()
    if existing.data:
        client.delete_rules([r.id for r in existing.data])
        logger.info("Deleted %d existing rules", len(existing.data))
    gazetteer = load_gazetteer()
    rule_strings = build_stream_rules(gazetteer)
    client.add_rules([tweepy.StreamRule(value=r) for r in rule_strings])
    logger.info("Configured %d stream rules", len(rule_strings))


def run() -> None:
    bearer_token = os.environ["X_BEARER_TOKEN"]  # raises loudly if unset — do not fall back silently
    engine = create_engine(os.getenv("DATABASE_URL", "postgresql://localhost/ghana2028"))
    stream = GhanaPoliticsStream(bearer_token, engine)
    stream.filter(tweet_fields=["created_at", "author_id", "geo", "lang"])


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--setup-rules", action="store_true")
    group.add_argument("--run", action="store_true")
    args = parser.parse_args()
    if args.setup_rules:
        setup_rules(os.environ["X_BEARER_TOKEN"])
    else:
        run()
