"""
Published-poll ingestion — semi-manual by design. Real probability-sample
polls (Afrobarometer, CDD-Ghana, Global InfoAnalytics, IEA) are published as
PDFs/press releases, not APIs, so this module is a structured entry point,
not a scraper. Add each poll as it's released; the forecasting engine will
refuse to run without at least one poll in the table (see transfer_function.py)
because sentiment alone is not a valid vote-share estimator per the spec.

Usage:
    python -m ingestion.poll_ingest --add \\
        --pollster "Global InfoAnalytics" \\
        --fieldwork-start 2027-03-01 --fieldwork-end 2027-03-10 \\
        --published 2027-03-15 --sample-size 2400 \\
        --party NDC --vote-share 52.2 --moe 2.0 \\
        --source-url "https://example.com/poll-release"
"""
import argparse
import os
from datetime import date

import yaml
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "settings.yaml")


def load_house_weight(pollster: str) -> float:
    with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
        settings = yaml.safe_load(f)
    weights = settings["forecasting"]["pollster_house_weights"]
    return weights.get(pollster, weights.get("party-aligned-unverified", 0.4))


def add_poll(
    pollster: str,
    fieldwork_start: date,
    fieldwork_end: date,
    published_date: date,
    sample_size: int,
    party_code: str,
    vote_share_pct: float,
    margin_of_error_pct: float | None,
    source_url: str,
    methodology_note: str | None = None,
) -> None:
    engine = create_engine(os.getenv("DATABASE_URL", "postgresql://localhost/ghana2028"))
    house_weight = load_house_weight(pollster)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO poll_results
                    (pollster, fieldwork_start, fieldwork_end, published_date, sample_size,
                     methodology_note, party_code, vote_share_pct, margin_of_error_pct,
                     source_url, house_weight_applied)
                VALUES
                    (:pollster, :fw_start, :fw_end, :pub_date, :n, :note, :party, :share, :moe, :url, :weight)
                """
            ),
            {
                "pollster": pollster,
                "fw_start": fieldwork_start,
                "fw_end": fieldwork_end,
                "pub_date": published_date,
                "n": sample_size,
                "note": methodology_note,
                "party": party_code,
                "share": vote_share_pct,
                "moe": margin_of_error_pct,
                "url": source_url,
                "weight": house_weight,
            },
        )
    print(f"Recorded {pollster} poll: {party_code} {vote_share_pct}% (house weight {house_weight})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--add", action="store_true", required=True)
    parser.add_argument("--pollster", required=True)
    parser.add_argument("--fieldwork-start", type=date.fromisoformat, required=True)
    parser.add_argument("--fieldwork-end", type=date.fromisoformat, required=True)
    parser.add_argument("--published", type=date.fromisoformat, required=True)
    parser.add_argument("--sample-size", type=int, required=True)
    parser.add_argument("--party", required=True)
    parser.add_argument("--vote-share", type=float, required=True)
    parser.add_argument("--moe", type=float, default=None)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--note", default=None)
    args = parser.parse_args()
    add_poll(
        pollster=args.pollster,
        fieldwork_start=args.fieldwork_start,
        fieldwork_end=args.fieldwork_end,
        published_date=args.published,
        sample_size=args.sample_size,
        party_code=args.party,
        vote_share_pct=args.vote_share,
        margin_of_error_pct=args.moe,
        source_url=args.source_url,
        methodology_note=args.note,
    )
