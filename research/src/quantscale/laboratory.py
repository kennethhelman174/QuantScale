"""v0.5: isolated, read-only multi-model prediction laboratory.

Consumes existing completed candles and never accesses order endpoints.
Historic backfills and genuine forward predictions are stored separately.
"""
from __future__ import annotations
import argparse
import json
import math
import sqlite3
import time
from pathlib import Path
from datetime import datetime, timezone

NAMES = ("constant_50", "momentum", "range", "combined")
FEAT = {"momentum": (0,), "range": (1,), "combined": (0, 1, 2)}
LEARNING_RATE = 0.035
STEP = 900


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-max(-25.0, min(25.0, x))))


def features(previous, latest):
    close = latest[4]
    prior_close = previous[4]
    opening = latest[3]
    return (
        max(-1., min(1., (close / prior_close - 1.) * 100.)),
        max(0., min(1., (latest[2] - latest[1]) / opening * 100.)),
        max(-1., min(1., (close / opening - 1.) * 100.)),
    )


def predict(name, weights, x):
    if name == "constant_50":
        return 0.5
    indexes = FEAT[name]
    return sigmoid(weights[0] + sum(weights[j + 1] * x[j] for j in indexes))


def learn(name, weights, x, outcome):
    if name == "constant_50":
        return weights
    err = outcome - predict(name, weights, x)
    updated = list(weights)
    updated[0] = max(-8., min(8., updated[0] + LEARNING_RATE * err))
    for j in FEAT[name]:
        updated[j + 1] = max(-8., min(8., updated[j + 1] + LEARNING_RATE * err * x[j]))
    return updated


def init_db(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS forecasts(
      target_ts INTEGER NOT NULL, model TEXT NOT NULL, source_ts INTEGER NOT NULL,
      probability REAL NOT NULL, origin TEXT NOT NULL CHECK(origin IN ('forward','backfill')),
      issued_at INTEGER, outcome INTEGER, PRIMARY KEY(target_ts,model)
    );
    CREATE TABLE IF NOT EXISTS weights(
      model TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    """)
    for name in NAMES:
        db.execute("INSERT OR IGNORE INTO weights VALUES(?,?)",
                   (name, json.dumps([0., 0., 0., 0.])))
    db.commit()
    return db


def completed_source_candles(source_db, now):
    source_db = Path(source_db)
    if not source_db.is_file():
        raise FileNotFoundError(f"No source candle DB: {source_db}")
    with sqlite3.connect(f"file:{source_db.resolve()}?mode=ro", uri=True) as db:
        data = db.execute(
            "SELECT ts,low,high,opening,closing,volume FROM candles "
            "WHERE ts+?<=? ORDER BY ts", (STEP, (now // STEP)*STEP)
        ).fetchall()
    return data


def run(source_db, lab_db, now=None):
    now = int(time.time()) if now is None else int(now)
    closed_through = (now // STEP)*STEP
    rows = completed_source_candles(source_db, now)
    db = init_db(lab_db)
    try:
        weight_map = {name: json.loads(raw) for name, raw in db.execute("SELECT model,value FROM weights")}
        scored = 0
        forward_emitted = 0
        by_ts = {r[0]: r for r in rows}
        with db:
            for prev, candle in zip(rows, rows[1:]):
                if candle[0] - prev[0] != STEP:
                    continue
                ts = candle[0]
                # Resolve previously issued predictions only once close is known.
                pending = db.execute("SELECT model,source_ts FROM forecasts WHERE target_ts=? AND outcome IS NULL", (ts,)).fetchall()
                for name, source_ts in pending:
                    if source_ts != prev[0]:
                        continue
                    y = int(candle[4] > prev[4])
                    db.execute("UPDATE forecasts SET outcome=? WHERE target_ts=? AND model=? AND outcome IS NULL",
                               (y, ts, name))
                    scored += 1
                    earlier = by_ts.get(source_ts - STEP)
                    source = by_ts.get(source_ts)
                    if earlier is not None and source is not None:
                        weight_map[name] = learn(name, weight_map[name],
                                                 features(earlier, source), y)
                # Next forecast uses only the completed current candle and preceding candle.
                target = ts + STEP
                x = features(prev, candle)
                historical = target < closed_through
                origin = "backfill" if historical else "forward"
                for name in NAMES:
                    if db.execute("SELECT 1 FROM forecasts WHERE target_ts=? AND model=?", (target, name)).fetchone():
                        continue
                    p = predict(name, weight_map[name], x)
                    db.execute("INSERT INTO forecasts VALUES(?,?,?,?,?,?,NULL)",
                               (target, name, ts, p, origin, None if historical else now))
                    if not historical:
                        forward_emitted += 1
                # Later chronological iteration scores the target.\n           # Persist bounded per-model weights after delayed label updates.
            for name, weights in weight_map.items():
                db.execute("UPDATE weights SET value=? WHERE model=?", (json.dumps(weights), name))
        metrics = {}
        for name in NAMES:
            history = db.execute("SELECT probability,outcome FROM forecasts WHERE model=? AND origin='forward' AND outcome IS NOT NULL ORDER BY target_ts DESC LIMIT 100", (name,)).fetchall()
            brier = sum((p-y)**2 for p,y in history)/len(history) if history else None
            metrics[name] = {"forward_evaluations":len(history), "forward_brier":brier}
        return {"source_candles":len(rows), "newly_scored_model_forecasts":scored,
                "forward_forecasts_issued":forward_emitted, "metrics":metrics,
                "auto_promotions":False, "live_trading":False,
                "note":"Forward Brier only; historic replay excluded."}
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=str(Path.home()/"quantscale-data"/"online.sqlite3"))
    parser.add_argument("--db", default=str(Path.home()/"quantscale-data"/"laboratory.sqlite3"))
    args = parser.parse_args()
    print(json.dumps(run(args.source, args.db), indent=2))


if __name__ == "__main__":
    main()
