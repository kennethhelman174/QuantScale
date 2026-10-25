import json
import sqlite3
import pytest
from quantscale.governance import review,snapshot,rollback_plan,MIN_SAMPLES
from quantscale.laboratory import init_db

def make_lab(tmp_path,count,prob=.4,baseline=.5,origin="forward"):
    path=tmp_path/"lab.db"
    db=init_db(path)
    with db:
        for i in range(count):
            for name,p in (("momentum",prob),("constant_50",baseline)):
                db.execute("INSERT INTO forecasts VALUES(?,?,?,?,?,?,?)",
                           ((i+1)*900,name,i*900,p,origin,(i+1)*900 if origin=="forward" else None,0))
    db.close()
    return path

def test_never_auto_promotes(tmp_path):
    lab=make_lab(tmp_path,240)
    db=tmp_path/"gov.db"
    result=review(lab,db,now=400000)
    assert result["auto_promotion"] is False
    assert result["candidates"][0]["eligible_for_manual_review"] is True
    with sqlite3.connect(db) as connection:
        assert connection.execute("SELECT count(*) FROM decisions").fetchone()[0]==3

def test_backfill_does_not_qualify(tmp_path):
    lab=make_lab(tmp_path,300,origin="backfill")
    result=review(lab,tmp_path/"gov.db")
    assert all(not c["eligible_for_manual_review"] for c in result["candidates"])

def test_small_sample_rejected(tmp_path):
    lab=make_lab(tmp_path,50)
    result=review(lab,tmp_path/"gov.db")
    assert result["candidates"][0]["reason"]=="insufficient_forward_samples"

def test_snapshot_integrity_and_no_weight_write(tmp_path):
    lab=make_lab(tmp_path,1)
    gov=tmp_path/"gov.db"
    snap=snapshot(lab,gov,"momentum",now=100)
    assert len(snap["sha256"])==64
    plan=rollback_plan(gov,snap["snapshot_id"])
    assert plan["requires_manual_restore"]
    with sqlite3.connect(lab) as d:
        assert json.loads(d.execute("SELECT value FROM weights WHERE model='momentum'").fetchone()[0])==[0.,0.,0.,0.]

def test_corrupt_snapshot_rejected(tmp_path):
    lab=make_lab(tmp_path,1)
    gov=tmp_path/"gov.db"
    snap=snapshot(lab,gov,"momentum")
    with sqlite3.connect(gov) as d:
        d.execute("UPDATE snapshots SET weights_json='[]'")
    with pytest.raises(ValueError,match="integrity"):
        rollback_plan(gov,snap["snapshot_id"])
