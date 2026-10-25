import csv
import pytest
from quantscale import coinbase


def test_utc_required():
    with pytest.raises(ValueError):
        coinbase.utc_seconds("2026-01-01T00:00:00")


def test_invalid_candle():
    with pytest.raises(ValueError):
        coinbase.validate_candle([900, 120, 100, 110, 115, 2], 900)


def test_collect_pages_and_sort(monkeypatch):
    def fake(product, start, end, granularity):
        if start == 0:
            return [[900, 95, 105, 99, 100, 1], [0, 90, 101, 95, 98, 2]]
        return []
    monkeypatch.setattr(coinbase, "request_candles", fake)
    monkeypatch.setattr(coinbase.time, "time", lambda: 500000)
    result = coinbase.collect("BTC-USD", 0, 1800, 900, sleep_seconds=0)
    assert [r[0] for r in result] == [0, 900]


def test_conflicting_duplicate_rejected(monkeypatch):
    monkeypatch.setattr(coinbase.time, "time", lambda: 500000)
    monkeypatch.setattr(coinbase, "request_candles", lambda *a: [[0, 90, 100, 95, 99, 1], [0, 90, 100, 96, 99, 1]])
    with pytest.raises(ValueError, match="Conflicting"):
        coinbase.collect("BTC-USD", 0, 900, 900)


def test_atomic_csv(tmp_path):
    path = tmp_path / "candles.csv"
    coinbase.atomic_write_csv(path, [(0, 90, 100, 95, 99, 1)])
    with path.open() as f:
        assert list(csv.DictReader(f))[0]["close"] == "99"
