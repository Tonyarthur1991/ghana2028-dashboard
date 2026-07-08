"""
Core forecasting model: poll-blend baseline + sentiment-trend adjustment +
incumbency-weighted issue-accountability adjustment, with Bayesian credible
intervals. Implements the transfer function from the spec:

    V_hat[p,t] = V_poll_blend[p,t] + beta * delta_S[p,t]
                 + gamma * I[p,t] + epsilon_t

Design principle (non-negotiable per the spec): sentiment is not a vote-share
estimator on its own. This module refuses to produce a forecast without at
least one poll data point — sentiment can only *adjust* a poll-anchored
baseline, never substitute for one. This is enforced in code, not just
documentation, because it's the single most important credibility safeguard
in the whole system.

Issue-accountability term I[p,t]: negative sentiment on issues voters hold
the *government* accountable for (economy, corruption, energy, employment,
health, fuel — see accountable_issue_codes) is assumed to weigh differently
on the incumbent than on opposition parties. The incumbent absorbs it
directly; opposition parties absorb only a fraction of it (opposition_
transfer_fraction), since discontent with the incumbent does not convert
1:1 into opposition support — plenty goes to undecided/non-voting instead.

This is a modelling ASSUMPTION, not a measured fact: nothing in the ingestion
pipeline currently measures sentiment about a party's handling of a specific
issue, only (a) sentiment about the issue in general and (b) sentiment about
each party in general, independently. Treat gamma exactly like beta was
treated before its first backtest — defaulted to 0.0 (no effect) until
re-estimated against real outcomes. Do not set it non-zero in production
without a backtest_2024.py-style validation run first.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date


class InsufficientPollDataError(Exception):
    """Raised when no poll data exists to anchor the forecast. Sentiment-only
    forecasting is explicitly disallowed — see module docstring."""


@dataclass
class PollObservation:
    pollster: str
    published_date: date
    party_code: str
    vote_share_pct: float
    sample_size: int
    house_weight: float = 1.0


@dataclass
class SentimentObservation:
    day: date
    party_code: str
    weighted_mean_sentiment: float  # [-1, +1]


@dataclass
class IssueSentimentObservation:
    """Sentiment about an ISSUE, not about any party — mirrors the
    issues_salience shape in the dashboard API contract. No party_code here
    by design; see module docstring on why issue-party attribution isn't
    measured yet."""

    day: date
    issue_code: str
    net_sentiment: float  # [-1, +1]
    mention_volume: int


@dataclass
class ForecastResult:
    party_code: str
    point_estimate_pct: float
    ci_lower_pct: float
    ci_upper_pct: float
    ci_level: float
    poll_blend_input: float
    sentiment_delta_input: float
    beta_used: float
    issue_adjustment_input: float
    issue_gamma_used: float
    n_polls_used: int
    sampling_variance: float
    model_variance: float


def recency_weight(obs_date: date, as_of: date, half_life_days: float) -> float:
    age_days = (as_of - obs_date).days
    if age_days < 0:
        age_days = 0
    return 0.5 ** (age_days / half_life_days)


def poll_blend(
    polls: list[PollObservation],
    party_code: str,
    as_of: date,
    poll_half_life_days: float,
) -> tuple[float, float, int]:
    """Recency- and house-weighted average of published polls for one party.
    Returns (blended_estimate, sampling_variance, n_polls_used)."""
    relevant = [p for p in polls if p.party_code == party_code]
    if not relevant:
        raise InsufficientPollDataError(
            f"No poll observations for {party_code} — cannot anchor forecast to sentiment alone."
        )

    weights, values, variances = [], [], []
    for p in relevant:
        w = recency_weight(p.published_date, as_of, poll_half_life_days) * p.house_weight
        weights.append(w)
        values.append(p.vote_share_pct)
        # binomial-approximation sampling variance for a proportion poll, in pct^2
        prop = p.vote_share_pct / 100.0
        variances.append(((prop * (1 - prop)) / max(p.sample_size, 1)) * (100**2))

    total_w = sum(weights)
    blended = sum(v * w for v, w in zip(values, weights)) / total_w
    # weighted average of individual sampling variances, downweighted by
    # effective sample size (more polls agreeing -> lower blended variance)
    blended_variance = sum(var * w for var, w in zip(variances, weights)) / total_w / max(len(relevant), 1)
    return blended, blended_variance, len(relevant)


def sentiment_delta(
    sentiment_series: list[SentimentObservation],
    party_code: str,
    as_of: date,
    lookback_days: int = 30,
) -> float:
    """Standardised month-on-month change in weighted sentiment for a party.
    Returns 0.0 (neutral, no adjustment) if there isn't enough history —
    fails safe rather than guessing."""
    relevant = sorted(
        (s for s in sentiment_series if s.party_code == party_code), key=lambda s: s.day
    )
    if len(relevant) < 2:
        return 0.0

    recent_cutoff = as_of.toordinal() - lookback_days
    prior_cutoff = recent_cutoff - lookback_days

    recent = [s.weighted_mean_sentiment for s in relevant if s.day.toordinal() >= recent_cutoff]
    prior = [
        s.weighted_mean_sentiment
        for s in relevant
        if prior_cutoff <= s.day.toordinal() < recent_cutoff
    ]
    if not recent or not prior:
        return 0.0

    recent_mean = sum(recent) / len(recent)
    prior_mean = sum(prior) / len(prior)
    raw_delta = recent_mean - prior_mean

    all_scores = [s.weighted_mean_sentiment for s in relevant]
    mean_all = sum(all_scores) / len(all_scores)
    variance_all = sum((x - mean_all) ** 2 for x in all_scores) / max(len(all_scores) - 1, 1)
    std_all = math.sqrt(variance_all) if variance_all > 0 else 1.0

    return raw_delta / std_all  # standardised delta, unitless


def issue_accountability_adjustment(
    issue_series: list[IssueSentimentObservation],
    party_code: str,
    incumbent_party_code: str | None,
    accountable_issue_codes: list[str],
    as_of: date,
    lookback_days: int = 30,
    opposition_transfer_fraction: float = 0.4,
) -> float:
    """Volume-weighted net sentiment across government-accountable issues
    over the lookback window, signed for the party's incumbency status.

    Returns 0.0 (no adjustment) if there's no incumbent configured, no
    accountable issues configured, or no issue data in the window — fails
    safe rather than guessing, same convention as sentiment_delta().

    Incumbent: adjustment = raw weighted issue sentiment (bad issue mood
    drags the incumbent down directly).
    Opposition: adjustment = -raw weighted issue sentiment *
    opposition_transfer_fraction (bad issue mood helps opposition, but only
    partially — discontent doesn't convert 1:1 into opposition support).
    Any other party (minor parties, not incumbent and not modelled as "the"
    opposition): 0.0. Extend this if a minor party becomes electorally
    relevant enough to warrant its own transfer fraction.
    """
    if not incumbent_party_code or not accountable_issue_codes:
        return 0.0

    cutoff = as_of.toordinal() - lookback_days
    relevant = [
        obs
        for obs in issue_series
        if obs.issue_code in accountable_issue_codes and obs.day.toordinal() >= cutoff
    ]
    if not relevant:
        return 0.0

    total_volume = sum(obs.mention_volume for obs in relevant)
    if total_volume == 0:
        return 0.0
    weighted_sentiment = sum(obs.net_sentiment * obs.mention_volume for obs in relevant) / total_volume

    if party_code == incumbent_party_code:
        return weighted_sentiment
    if incumbent_party_code and party_code != incumbent_party_code:
        return -weighted_sentiment * opposition_transfer_fraction
    return 0.0


def forecast(
    party_code: str,
    as_of: date,
    polls: list[PollObservation],
    sentiment_series: list[SentimentObservation],
    beta: float,
    poll_half_life_days: float = 30.0,
    sentiment_lookback_days: int = 30,
    ci_level: float = 0.95,
    model_uncertainty_pct: float = 3.0,
    issue_series: list[IssueSentimentObservation] | None = None,
    incumbent_party_code: str | None = None,
    accountable_issue_codes: list[str] | None = None,
    issue_gamma: float = 0.0,
    issue_lookback_days: int = 30,
    opposition_transfer_fraction: float = 0.4,
    issue_model_uncertainty_pct: float = 0.0,
) -> ForecastResult:
    """Produces a single-party forecast. Raises InsufficientPollDataError if
    there is no poll anchor — this is intentional, see module docstring.

    The issue_* parameters all default to inert (issue_gamma=0.0, no
    incumbent configured) so existing callers — including backtest_2024.py,
    which has no per-issue data — are unaffected until this pathway is
    deliberately enabled and backtested."""
    blended, sampling_variance, n_polls = poll_blend(polls, party_code, as_of, poll_half_life_days)
    delta_s = sentiment_delta(sentiment_series, party_code, as_of, sentiment_lookback_days)
    issue_adj = issue_accountability_adjustment(
        issue_series or [],
        party_code,
        incumbent_party_code,
        accountable_issue_codes or [],
        as_of,
        issue_lookback_days,
        opposition_transfer_fraction,
    )

    point_estimate = blended + beta * delta_s + issue_gamma * issue_adj

    # Total variance = sampling variance (from poll SE) + model uncertainty.
    # Model uncertainty is split into the sentiment-transfer term and the
    # issue-accountability term so callers can see which unvalidated
    # assumption is contributing how much, rather than one opaque number —
    # same reasoning as keeping sampling and model variance separate below.
    model_variance = model_uncertainty_pct**2 + issue_model_uncertainty_pct**2
    total_variance = sampling_variance + model_variance
    se = math.sqrt(total_variance)

    z = _z_for_confidence(ci_level)
    ci_lower = max(0.0, point_estimate - z * se)
    ci_upper = min(100.0, point_estimate + z * se)

    return ForecastResult(
        party_code=party_code,
        point_estimate_pct=round(point_estimate, 2),
        ci_lower_pct=round(ci_lower, 2),
        ci_upper_pct=round(ci_upper, 2),
        ci_level=ci_level,
        poll_blend_input=round(blended, 2),
        sentiment_delta_input=round(delta_s, 3),
        beta_used=beta,
        issue_adjustment_input=round(issue_adj, 3),
        issue_gamma_used=issue_gamma,
        n_polls_used=n_polls,
        sampling_variance=round(sampling_variance, 3),
        model_variance=round(model_variance, 3),
    )


def _z_for_confidence(ci_level: float) -> float:
    # Standard normal z-scores for common confidence levels — avoids pulling
    # in scipy.stats just for a lookup of 3 values.
    table = {0.80: 1.2816, 0.90: 1.6449, 0.95: 1.9600, 0.99: 2.5758}
    if ci_level in table:
        return table[ci_level]
    raise ValueError(f"Unsupported CI level {ci_level}; add it to the lookup table if needed.")
