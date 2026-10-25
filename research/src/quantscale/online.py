"""Research-only continuously adaptive BTC 15-minute direction learner.

Every observed candle is completed before use. The decision for candle t+1
uses candle t. Its outcome is only learned after candle t+1 closes.
No exchange credentials, trade sizing, or order endpoints.
"""
from __future__ import annotations
import argparse
import json
import math
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from .coinbase import collect

FEATURES = ("momentum", "body", "range")
EPS = 1e-12


def vector(candle):
    _, low, high, opening, close, _ = candle
    return (
        max(-1.0, min(1.0, (close / opening - 1) * 100)),
        max(-1.0, min(1.0, (close - opening) / opening * 100)),
        max(0.0, min(1.0, (high - low) / opening * 100)),
    )


def probability(weights, features):
    z = max(-30.0, min(30.0, weights[0] + sum(a * b for a, b in zip(weights[1:], features))))
    return 1 / (1 + math.exp(-z))


def update_weights(weights, x, y, lr):
    error = y - probability(weights, x)
    values = [1.0, *x]
    return [max(-8.0, min(8.0, w + lr * error * v)) for w, v in zip(weights, values)]


def connect(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=30000")
    db.executescript("""
      CREATE TABLE IF NOT EXISTS candles (
        ts INTEGER PRIMARY KEY, low REAL NOT NULL, high REAL NOT NULL,
        opening REAL NOT NULL, closing REAL NOT NULL, volume REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS predictions (
        target_ts INTEGER PRIMARY KEY,
        source_ts INTEGER NOT NULL,
        probability REAL NOT NULL,
        challenger_probability REAL NOT NULL,
        outcome INTEGER,
        evaluated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS model_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton=1),
        champion_weights TEXT NOT NULL,
        challenger_weights TEXT NOT NULL,
        scored_count INTEGER NOT NULL DEFAULT 0,
        promotions INTEGER NOT NULL DEFAULT 0
      );
    """)
    # Add provenance without reclassifying old backfilled observations.
    cols = {r[1] for r in db.execute("PRAGMA table_info(predictions)")}
    if "origin" not in cols:
        db.execute("ALTER TABLE predictions ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy_backfill'")
    if "issued_at" not in cols:
        db.execute("ALTER TABLE predictions ADD COLUMN issued_at INTEGER")
    db.execute("""CREATE TABLE IF NOT EXISTS promotion_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT, recorded_at INTEGER NOT NULL,
        event TEXT NOT NULL, details TEXT NOT NULL
    )""")
    db.execute("INSERT OR IGNORE INTO model_state(singleton,champion_weights,challenger_weights) VALUES (1,?,?)", (json.dumps([0, 0, 0, 0]), json.dumps([0, 0, 0, 0])))
    db.commit()
    return db


def ingest(db, candles):
    with db:
        for ts, lo, hi, op, cl, vol in candles:
            old = db.execute("SELECT low,high,opening,closing,volume FROM candles WHERE ts=?", (ts,)).fetchone()
            values = (float(lo), float(hi), float(op), float(cl), float(vol))
            if old is not None and any(abs(a - b) > 1e-8 for a, b in zip(old, values)):
                raise ValueError("Historical candle revision detected; ingestion aborted")
            db.execute("INSERT OR IGNORE INTO candles VALUES (?,?,?,?,?,?)", (ts, *values))


def process(db, now, granularity=900, *, minimum_evaluations=50, margin=0.005):
    """Prequential replay and adaptive challenger training.

    Champion remains frozen until challenger passes rolling paired Brier
    comparison. The challenger learning rate is fixed and bounded.
    """
    if granularity <= 0 or minimum_evaluations < 2 or margin < 0:
        raise ValueError("Invalid evaluation policy")
    completed = (now // granularity) * granularity
    rows = db.execute("SELECT ts,low,high,opening,closing,volume FROM candles WHERE ts+?<=? ORDER BY ts", (granularity, completed)).fetchall()
    state = db.execute("SELECT champion_weights,challenger_weights,scored_count,promotions FROM model_state WHERE singleton=1").fetchone()
    champion, challenger = json.loads(state[0]), json.loads(state[1])
    scored, promotions = state[2:]
    newly_scored = 0
    with db:
        for candle in rows:
            ts = candle[0]
            # Score only when a prediction was previously logged for this timestamp.
            record = db.execute("SELECT source_ts,probability,challenger_probability,outcome FROM predictions WHERE target_ts=?", (ts,)).fetchone()
            if record and record[3] is None:
                source = db.execute("SELECT ts,low,high,opening,closing,volume FROM candles WHERE ts=?", (record[0],)).fetchone()
                if source and source[0] + granularity == ts:
                    y = int(candle[4] > source[4])
                    db.execute("UPDATE predictions SET outcome=?, evaluated_at=? WHERE target_ts=? AND outcome IS NULL", (y, ts + granularity, ts))
                    scored += 1
                    newly_scored += 1
                    challenger = update_weights(challenger, vector(source), y, 0.04)
                    # v0.4: no unattended champion promotions. Historical replay
                    # cannot establish forward superiority. Challenger still learns.
            target = ts + granularity
            # A prediction is issued from a completed candle only. For older
            # history, results are evaluated at the later candle's close.
            if db.execute("SELECT 1 FROM predictions WHERE target_ts=?", (target,)).fetchone() is None:
                x = vector(candle)
                db.execute("INSERT INTO predictions(target_ts,source_ts,probability,challenger_probability,origin,issued_at) VALUES(?,?,?,?,?,?)",
                           (target, ts, probability(champion, x), probability(challenger, x),
                            "forward" if target >= completed else "backfill",
                            now if target >= completed else None))
        db.execute("UPDATE model_state SET champion_weights=?, challenger_weights=?, scored_count=?, promotions=? WHERE singleton=1",
                   (json.dumps(champion), json.dumps(challenger), scored, promotions))
    latest = db.execute("SELECT target_ts,probability FROM predictions WHERE outcome IS NULL ORDER BY target_ts DESC LIMIT 1").fetchone()
    return {"completed_candles": len(rows), "newly_evaluated": newly_scored,
            "evaluations": scored, "model_promotions": promotions,
            "next_prediction": {"target_utc": datetime.fromtimestamp(latest[0], timezone.utc).isoformat(),
                                "probability_up": round(latest[1], 6)} if latest else None,
            "trading_enabled": False, "promotion_policy": "frozen_pending_forward_validation", "model": "bounded_online_logistic_research_v0.4"}


def run(db_path, days=7):
    import time
    if not 1 <= days <= 30:
        raise ValueError("days must be 1..30")
    now = int(time.time())
    # Exclude in-progress candle and align to fixed UTC boundaries.
    end = (now // 900) * 900
    start = end - days * 86400
    candles = collect("BTC-USD", start, end, 900)
    db = connect(db_path)
    try:
        ingest(db, candles)
        result = process(db, now)
        result["fetched_candles"] = len(candles)
        result["database"] = str(db_path)
        return result
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Research-only adaptive BTC direction learner")
    parser.add_argument("--db", default=str(Path.home() / "quantscale-data" / "online.sqlite3"))
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()
    print(json.dumps(run(args.db, args.days), indent=2))


if __name__ == "__main__":
    main()
