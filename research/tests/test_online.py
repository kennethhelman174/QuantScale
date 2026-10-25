import sqlite3
from quantscale.online import connect, ingest, process, probability, update_weights


def candle(ts, op, cl):
    return (ts, min(op, cl), max(op, cl), op, cl, 10.0)


def test_weights_adapt():
    w = [0.0] * 4
    x = (0.5, 0.5, 0.1)
    assert probability(update_weights(w, x, 1, 0.04), x) > probability(w, x)


def test_no_future_label_leak(tmp_path):
    db = connect(tmp_path / "a.sqlite3")
    ingest(db, [candle(0, 100, 101), candle(900, 101, 103)])
    a = process(db, now=1800)
    assert a["evaluations"] == 1
    pred = db.execute("SELECT outcome FROM predictions WHERE target_ts=1800").fetchone()
    assert pred == (None,)
    process(db, now=1800)
    assert db.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 2
    db.close()


def test_missing_interval_not_labeled(tmp_path):
    db = connect(tmp_path / "x.sqlite3")
    ingest(db, [candle(0, 100, 101), candle(1800, 101, 102)])
    result = process(db, now=2700)
    assert result["evaluations"] == 0
    db.close()


def test_future_candle_not_predicted(tmp_path):
    db = connect(tmp_path / "z.sqlite3")
    ingest(db, [candle(0, 100, 101), candle(900, 101, 102)])
    r = process(db, now=900)
    assert r["evaluations"] == 0
    assert db.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 0
    db.close()
