"""Public Coinbase Exchange OHLCV ingestion for research; no trading API keys.

Exchange candle timestamps are UTC seconds. Coinbase may omit buckets with
no trades, so absence is not automatically interpreted as zero trading.
"""
from __future__ import annotations
import csv
import json
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_URL = "https://api.exchange.coinbase.com"
ALLOWED_SECONDS = {60, 300, 900, 3600, 21600, 86400}
HEADER = ["timestamp", "low", "high", "open", "close", "volume"]


def utc_seconds(value: str) -> int:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError("date must have explicit timezone (e.g. Z)")
    if dt.microsecond:
        raise ValueError("timestamp must be at whole seconds")
    return int(dt.timestamp())


def validate_candle(record: object, granularity: int) -> tuple[int, ... | float]:
    if not isinstance(record, list) or len(record) != 6:
        raise ValueError("Unexpected candle shape")
    ts, low, high, op, close, volume = record
    if isinstance(ts, bool) or not isinstance(ts, int) or ts % granularity:
        raise ValueError("Invalid candle timestamp")
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) for x in (low, high, op, close, volume)):
        raise ValueError("Non-numeric OHLCV value")
    import math
    if not all(math.isfinite(x) for x in (low, high, op, close, volume)):
        raise ValueError("Non-finite OHLCV value")
    if low <= 0 or high < low or volume < 0 or not(low <= op <= high and low <= close <= high):
        raise ValueError("Inconsistent OHLCV candle")
    return (ts, low, high, op, close, volume)


def request_candles(product: str, start: int, end: int, granularity: int, *, max_retries: int = 3) -> list:
    params = urlencode({"start": datetime.fromtimestamp(start, timezone.utc).isoformat(),
                        "end": datetime.fromtimestamp(end, timezone.utc).isoformat(),
                        "granularity": granularity})
    url = f"{BASE_URL}/products/{product}/candles?{params}"
    for attempt in range(max_retries):
        try:
            req = Request(url, headers={"User-Agent": "QuantScaleResearch/0.2", "Accept": "application/json"})
            with urlopen(req, timeout=30) as response:
                data = json.load(response)
            if not isinstance(data, list):
                raise ValueError("Unexpected Coinbase response")
            return data
        except (HTTPError, URLError, TimeoutError) as error:
            retryable = not isinstance(error, HTTPError) or error.code in (429, 500, 502, 503, 504)
            if not retryable or attempt == max_retries - 1:
                raise
            time.sleep(min(2 ** attempt, 8))
    raise AssertionError("unreachable")


def collect(product: str, start: int, end: int, granularity: int = 900, *, sleep_seconds: float = 0.35) -> list[tuple]:
    if product != "BTC-USD":
        raise ValueError("Collector initially supports BTC-USD only")
    if granularity not in ALLOWED_SECONDS:
        raise ValueError("Unsupported granularity")
    now = int(time.time())
    if start >= end or start < 0 or end > now:
        raise ValueError("Require a historical, positive date range")
    start_aligned = (start // granularity) * granularity
    end_aligned = (end // granularity) * granularity
    if start != start_aligned or end != end_aligned:
        raise ValueError("Start and end must align to candle boundaries")
    records = {}
    cursor = start
    while cursor < end:
        limit = min(cursor + 299 * granularity, end)
        page = request_candles(product, cursor, limit, granularity)
        for item in page:
            c = validate_candle(item, granularity)
            if start <= c[0] < end:
                if c[0] in records and records[c[0]] != c:
                    raise ValueError("Conflicting duplicate candle timestamp")
                records[c[0]] = c
        cursor = limit
        if cursor < end:
            time.sleep(sleep_seconds)
    return [records[t] for t in sorted(records)]


def atomic_write_csv(path: str | Path, candles: list[tuple]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".candles-", suffix=".csv", dir=target.parent)
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(HEADER)
            writer.writerows(candles)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Fetch Coinbase public BTC-USD candles; historical research only")
    parser.add_argument("--start", required=True, help="ISO-8601 UTC inclusive, e.g. 2026-10-01T00:00:00Z")
    parser.add_argument("--end", required=True, help="ISO-8601 UTC exclusive, e.g. 2026-10-02T00:00:00Z")
    parser.add_argument("--granularity", type=int, default=900)
    parser.add_argument("--output", default="data/btc_usd_candles.csv")
    args = parser.parse_args()
    candles = collect("BTC-USD", utc_seconds(args.start), utc_seconds(args.end), args.granularity)
    atomic_write_csv(args.output, candles)
    count_expected = (utc_seconds(args.end) - utc_seconds(args.start)) // args.granularity
    print(json.dumps({"product": "BTC-USD", "rows": len(candles),
                      "expected_slots": count_expected, "missing_slots": count_expected - len(candles),
                      "path": args.output, "note": "Missing intervals are not filled or invented"}))


if __name__ == "__main__":
    main()
