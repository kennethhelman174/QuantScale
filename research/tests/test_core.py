from datetime import datetime, timezone
from decimal import Decimal as D
import pytest
from quantscale.core import Observation, chronological_split, read_observations, replay, summarize


def o(i, p="0.80", y="0.60", n="0.45", outcome=True):
    return Observation(datetime(2026, 1, i + 1, tzinfo=timezone.utc), str(i), D(p), D(y), D(n), outcome)


def test_yes_trade():
    x = replay([o(1)])
    assert x[0].side == "YES" and x[0].pnl == D("0.38")


def test_no_trade():
    x = replay([o(1, p="0.10", y="0.95", n="0.40", outcome=False)])
    assert x[0].side == "NO" and x[0].pnl == D("0.58")


def test_skip():
    x = summarize(replay([o(1, p="0.5", y="0.50", n="0.50")]))
    assert x["trades"] == 0 and x["skipped"] == 1


def test_split():
    a, b = chronological_split([o(i) for i in range(1, 9)])
    assert max(x.timestamp for x in a) < min(x.timestamp for x in b)


def test_invalid_csv(tmp_path):
    f = tmp_path / "bad.csv"
    f.write_text("timestamp,market_id,probability_yes,yes_ask,no_ask,outcome_yes\n2026-01-01T00:00:00Z,X,NaN,0.4,0.4,1\n")
    with pytest.raises(ValueError):
        read_observations(f)
