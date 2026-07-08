"""
Pytest wrapper around the transfer function's core guarantees. Run with:
    pytest tests/
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "forecasting"))

import pytest
from transfer_function import (
    InsufficientPollDataError,
    IssueSentimentObservation,
    PollObservation,
    SentimentObservation,
    forecast,
    issue_accountability_adjustment,
    poll_blend,
    sentiment_delta,
)


def test_forecast_refuses_without_polls():
    """Non-negotiable per spec: sentiment alone must never produce a forecast."""
    with pytest.raises(InsufficientPollDataError):
        forecast(
            party_code="NDC",
            as_of=date(2028, 6, 1),
            polls=[],
            sentiment_series=[
                SentimentObservation(day=date(2028, 5, 1), party_code="NDC", weighted_mean_sentiment=0.5)
            ],
            beta=0.35,
        )


def test_poll_blend_weights_recent_polls_higher():
    old_poll = PollObservation(
        pollster="A", published_date=date(2028, 1, 1), party_code="NDC",
        vote_share_pct=40.0, sample_size=1000,
    )
    recent_poll = PollObservation(
        pollster="B", published_date=date(2028, 6, 1), party_code="NDC",
        vote_share_pct=60.0, sample_size=1000,
    )
    blended, _, n = poll_blend([old_poll, recent_poll], "NDC", as_of=date(2028, 6, 1), poll_half_life_days=30)
    assert n == 2
    assert blended > 50.0  # recent poll should dominate given the age gap


def test_sentiment_delta_zero_with_insufficient_history():
    single_obs = [SentimentObservation(day=date(2028, 6, 1), party_code="NDC", weighted_mean_sentiment=0.5)]
    assert sentiment_delta(single_obs, "NDC", as_of=date(2028, 6, 15)) == 0.0


def test_forecast_ci_widens_with_fewer_polls():
    poll = PollObservation(
        pollster="A", published_date=date(2028, 6, 1), party_code="NDC",
        vote_share_pct=52.0, sample_size=300,  # small sample -> larger sampling variance
    )
    result = forecast(
        party_code="NDC", as_of=date(2028, 6, 5), polls=[poll], sentiment_series=[], beta=0.35,
    )
    assert result.ci_upper_pct - result.ci_lower_pct > 0
    assert result.ci_lower_pct <= result.point_estimate_pct <= result.ci_upper_pct


def test_issue_adjustment_defaults_to_inert():
    """No incumbent configured -> 0.0, so existing callers (incl.
    backtest_2024.py) are unaffected unless they opt in."""
    issues = [IssueSentimentObservation(day=date(2028, 6, 1), issue_code="economy", net_sentiment=-0.5, mention_volume=1000)]
    assert issue_accountability_adjustment(issues, "NDC", None, ["economy"], as_of=date(2028, 6, 5)) == 0.0
    assert issue_accountability_adjustment(issues, "NDC", "NDC", [], as_of=date(2028, 6, 5)) == 0.0
    assert issue_accountability_adjustment([], "NDC", "NDC", ["economy"], as_of=date(2028, 6, 5)) == 0.0


def test_issue_adjustment_hits_incumbent_directly_and_opposition_partially():
    """Negative sentiment on a government-accountable issue should drag the
    incumbent down directly, and give the opposition a partial, damped
    boost — never the full opposite swing."""
    issues = [IssueSentimentObservation(day=date(2028, 6, 1), issue_code="economy", net_sentiment=-0.4, mention_volume=1000)]

    incumbent_adj = issue_accountability_adjustment(
        issues, "NDC", incumbent_party_code="NDC", accountable_issue_codes=["economy"], as_of=date(2028, 6, 5)
    )
    opposition_adj = issue_accountability_adjustment(
        issues, "NPP", incumbent_party_code="NDC", accountable_issue_codes=["economy"], as_of=date(2028, 6, 5),
        opposition_transfer_fraction=0.4,
    )

    assert incumbent_adj == pytest.approx(-0.4)  # full weight, unsigned flip
    assert opposition_adj == pytest.approx(0.16)  # -(-0.4) * 0.4 transfer fraction
    assert abs(opposition_adj) < abs(incumbent_adj)  # opposition is always damped, never 1:1


def test_backtest_2024_within_tolerance():
    """Smoke-tests the actual backtest script logic against the real 2024
    certified result, using the repo's synthetic sentiment placeholder."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "forecasting"))
    import backtest_2024

    assert backtest_2024.run_backtest() is True
