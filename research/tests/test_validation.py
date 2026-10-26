import sqlite3
from quantscale.laboratory import init_db
from quantscale.validation import inspect,persist_report


def fixture(tmp_path,n,p=.3,origin="forward"):
    path=tmp_path/"lab.sqlite3"
    db=init_db(path)
    with db:
        for i in range(n):
            for name,prob in (("momentum",p),("constant_50",.5)):
                db.execute("INSERT INTO forecasts VALUES(?,?,?,?,?,?,?)",
                           ((i+1)*900,name,i*900,prob,origin,0,0))
    db.close()
    return path


def test_small_sample_never_eligible(tmp_path):
    report=inspect(fixture(tmp_path,40))
    assert not report["models"][0]["eligible_for_manual_review"]


def test_backfill_not_counted(tmp_path):
    report=inspect(fixture(tmp_path,250,origin="backfill"))
    assert report["models"][0]["paired_forward"]==0


def test_positive_stable_gain_only_manual(tmp_path):
    report=inspect(fixture(tmp_path,240))
    assert report["models"][0]["eligible_for_manual_review"]
    assert report["automatic_promotion"] is False


def test_consistent_underperformance_quarantined(tmp_path):
    report=inspect(fixture(tmp_path,240,p=.9))
    assert report["models"][0]["quarantined"]
    assert not report["models"][0]["eligible_for_manual_review"]


def test_audit_history(tmp_path):
    report=inspect(fixture(tmp_path,40))
    outfile=tmp_path/"governance.sqlite3"
    persist_report(report,outfile,now=123)
    with sqlite3.connect(outfile) as db:
        assert db.execute("SELECT COUNT(*) FROM validation_history").fetchone()[0]==3
