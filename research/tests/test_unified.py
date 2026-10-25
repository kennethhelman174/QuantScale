import sqlite3
from quantscale.online import connect
from quantscale.unified import load_models,build,MODELS

def test_empty_lab(tmp_path):
    found=load_models(tmp_path/"missing.sqlite3")
    assert len(found)==len(MODELS)
    assert all(m["brier"] is None for m in found)

def test_forward_only(tmp_path):
    lab=tmp_path/"lab.sqlite3"
    d=sqlite3.connect(lab)
    d.execute("CREATE TABLE forecasts (target_ts INTEGER,model TEXT,source_ts INTEGER,probability REAL,origin TEXT,issued_at INTEGER,outcome INTEGER)")
    d.execute("INSERT INTO forecasts VALUES(1,'momentum',0,.99,'backfill',NULL,0)")
    d.execute("INSERT INTO forecasts VALUES(2,'momentum',1,.5,'forward',2,1)")
    d.commit();d.close()
    result={r["name"]:r for r in load_models(lab)}
    assert result["momentum"]["forward"]==1
    assert result["momentum"]["brier"]==.25

def test_html_safe_and_read_only(tmp_path):
    learner=tmp_path/"online.sqlite3"
    db=connect(learner);db.close()
    page=tmp_path/"unified.html"
    build(learner,tmp_path/"none.sqlite3",page)
    content=page.read_text()
    assert "Research / paper-only" in content
    assert "DISABLED" in content
    assert "Awaiting real forward outcomes" in content
    assert "http://" not in content
