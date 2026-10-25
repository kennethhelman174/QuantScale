from quantscale.online import connect, ingest, process
from quantscale.monitor import diagnostics


def candle(ts, close):
    return (ts, close - 1, close + 1, close, close, 10.0)


def test_historical_backfill_never_counts_as_forward(tmp_path):
    dbfile = tmp_path / "model.sqlite3"
    db = connect(dbfile)
    ingest(db, [candle(i*900, 100+(i % 3)) for i in range(80)])
    result = process(db, now=80*900, minimum_evaluations=2, margin=0)
    assert result["model_promotions"] == 0
    assert result["promotion_policy"] == "frozen_pending_forward_validation"
    assert db.execute("SELECT COUNT(*) FROM predictions WHERE origin='backfill'").fetchone()[0] == 79
    assert db.execute("SELECT COUNT(*) FROM predictions WHERE origin='forward'").fetchone()[0] == 1
    assert diagnostics(dbfile, 20)["forward_scored"] == 0
    db.close()


def test_forward_prediction_labeled_only_after_candle_closes(tmp_path):
    dbfile = tmp_path / "model.sqlite3"
    db = connect(dbfile)
    ingest(db, [candle(0,100)])
    process(db, now=900)
    assert db.execute("SELECT origin,outcome FROM predictions WHERE target_ts=900").fetchone() == ("forward",None)
    ingest(db, [candle(900,101)])
    process(db, now=1800)
    assert db.execute("SELECT outcome FROM predictions WHERE target_ts=900").fetchone() == (1,)
    assert diagnostics(dbfile,20)["forward_scored"] == 1
    db.close()


def test_upgrader_keeps_legacy_history_unverified(tmp_path):
    import sqlite3
    path=tmp_path/"old.sqlite3"
    db=sqlite3.connect(path)
    db.execute("CREATE TABLE predictions (target_ts INTEGER PRIMARY KEY,source_ts INTEGER NOT NULL, probability REAL NOT NULL,challenger_probability REAL NOT NULL,outcome INTEGER,evaluated_at INTEGER)")
    db.execute("INSERT INTO predictions VALUES (900,0,0.5,0.5,1,1800)")
    db.commit()
    db.close()
    upgraded=connect(path)
    assert upgraded.execute("SELECT origin FROM predictions").fetchone()[0]=="legacy_backfill"
    upgraded.close()
