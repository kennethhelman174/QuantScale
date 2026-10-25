import sqlite3
from quantscale.laboratory import run, NAMES
from quantscale.online import connect, ingest


def candle(ts, price):
    return (ts,price-1,price+1,price,price,4)


def test_no_future_labels_and_idempotence(tmp_path):
    source=tmp_path/"online.sqlite3"
    db=connect(source)
    ingest(db,[candle(i*900,100+i) for i in range(4)])
    db.close()
    lab=tmp_path/"lab.sqlite3"
    first=run(source,lab,now=3600)
    assert first["live_trading"] is False
    with sqlite3.connect(lab) as d:
        assert d.execute("SELECT COUNT(*) FROM forecasts WHERE origin='forward'").fetchone()[0] == len(NAMES)
        assert d.execute("SELECT COUNT(*) FROM forecasts WHERE outcome IS NULL AND origin='forward'").fetchone()[0] == len(NAMES)
        n=d.execute("SELECT COUNT(*) FROM forecasts").fetchone()[0]
    run(source,lab,now=3600)
    with sqlite3.connect(lab) as d:
        assert d.execute("SELECT COUNT(*) FROM forecasts").fetchone()[0] == n


def test_only_closed_candles(tmp_path):
    src=tmp_path/"src.sqlite3"
    db=connect(src)
    ingest(db,[candle(i*900,100+i) for i in range(3)])
    db.close()
    r=run(src,tmp_path/"lab.sqlite3",now=900)
    assert r["source_candles"] == 1
    assert r["forward_forecasts_issued"] == 0
