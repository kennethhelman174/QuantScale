"""Research-only replay. Synthetic fills and fees; never places orders."""
from __future__ import annotations
import csv
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable

D = Decimal
ONE = D("1")
ZERO = D("0")


@dataclass(frozen=True)
class Observation:
    timestamp: datetime
    market_id: str
    probability_yes: Decimal
    yes_ask: Decimal
    no_ask: Decimal
    outcome_yes: bool


@dataclass(frozen=True)
class Decision:
    market_id: str
    side: str
    edge: Decimal
    pnl: Decimal
    cost: Decimal
    fee: Decimal


def parse_decimal(raw: str, label: str) -> Decimal:
    try:
        result = D(raw)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{label} must be decimal") from exc
    if not result.is_finite():
        raise ValueError(f"{label} must be finite")
    return result


def read_observations(path: str | Path) -> list[Observation]:
    output = []
    unique = set()
    with open(path, newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            stamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
            if stamp.tzinfo is None or stamp.utcoffset() is None:
                raise ValueError("timestamps must include timezone")
            market_id = row["market_id"].strip()
            if not market_id or market_id in unique:
                raise ValueError("market_id must be nonempty and unique")
            unique.add(market_id)
            prob = parse_decimal(row["probability_yes"], "probability_yes")
            yes = parse_decimal(row["yes_ask"], "yes_ask")
            no = parse_decimal(row["no_ask"], "no_ask")
            if not all(ZERO <= x <= ONE for x in (prob, yes, no)):
                raise ValueError("probabilities and prices must be between 0 and 1")
            if row["outcome_yes"] not in ("0", "1"):
                raise ValueError("outcome_yes must be 0 or 1")
            output.append(Observation(stamp, market_id, prob, yes, no, row["outcome_yes"] == "1"))
    if not output:
        raise ValueError("CSV contains no observations")
    return sorted(output, key=lambda x: (x.timestamp, x.market_id))


def replay(observations: Iterable[Observation], *, fee_per_contract: Decimal = D("0.02"), min_edge: Decimal = D("0.05")) -> list[Decision]:
    """One assumed contract bought at ask, held to resolution (no actual fills)."""
    if fee_per_contract < ZERO or min_edge < ZERO:
        raise ValueError("fee and edge threshold must be nonnegative")
    decisions = []
    for obs in observations:
        edge_yes = obs.probability_yes - obs.yes_ask - fee_per_contract
        edge_no = (ONE - obs.probability_yes) - obs.no_ask - fee_per_contract
        side, edge, ask = ("YES", edge_yes, obs.yes_ask) if edge_yes >= edge_no else ("NO", edge_no, obs.no_ask)
        if edge < min_edge:
            decisions.append(Decision(obs.market_id, "SKIP", max(edge_yes, edge_no), ZERO, ZERO, ZERO))
            continue
        payout = ONE if (obs.outcome_yes == (side == "YES")) else ZERO
        cost = ask + fee_per_contract
        decisions.append(Decision(obs.market_id, side, edge, payout - cost, cost, fee_per_contract))
    return decisions


def summarize(decisions: Iterable[Decision]) -> dict:
    rows = list(decisions)
    executed = [r for r in rows if r.side != "SKIP"]
    return {
        "evaluated": len(rows),
        "trades": len(executed),
        "skipped": len(rows) - len(executed),
        "yes_trades": sum(r.side == "YES" for r in executed),
        "no_trades": sum(r.side == "NO" for r in executed),
        "net_pnl_usd": str(sum((r.pnl for r in executed), ZERO)),
        "capital_spent_usd": str(sum((r.cost for r in executed), ZERO)),
        "assumption": "one synthetic ask fill; fixed placeholder fee; held to resolution",
    }


def chronological_split(rows: list[Observation], train_fraction: Decimal = D("0.7")) -> tuple[list[Observation], list[Observation]]:
    """Split across distinct timestamps; not a leak-proof market-label embargo."""
    if not ZERO < train_fraction < ONE:
        raise ValueError("train_fraction must be inside (0,1)")
    ordered = sorted(rows, key=lambda x: x.timestamp)
    pivot = max(1, min(len(ordered) - 1, int(len(ordered) * train_fraction)))
    boundary = ordered[pivot].timestamp
    training = [r for r in ordered if r.timestamp < boundary]
    testing = [r for r in ordered if r.timestamp >= boundary]
    if not training or not testing:
        raise ValueError("not enough distinct timestamps")
    return training, testing
