from quantscale.online import connect
from quantscale.monitor import diagnostics, write_dashboard
import pytest


def setup_db(tmp_path, count):
    file = tmp_path / "online.sqlite3"
    db = connect(file)
    with db:
        for i in range(count):
            db.execute("INSERT INTO predictions (target_ts,source_ts,probability,challenger_probability,outcome) VALUES (?,?,?,?,?)",
                       (900*(i+1), 900*i, 0.9, 0.6, 0))
    db.close()
    return file


def test_insufficient_samples(tmp_path):
    file = setup_db(tmp_path, 10)
    d = diagnostics(file, 20)
    assert d["status"] == "INSUFFICIENT_DATA"
    assert d["scored_predictions"] == 10
    assert d["recent_brier"] == pytest.approx(0.81)


def test_drift_warning(tmp_path):
    file = tmp_path / "online.sqlite3"
    db = connect(file)
    with db:
        for i in range(40):
            p = 0.1 if i < 20 else 0.9
            db.execute("INSERT INTO predictions (target_ts,source_ts,probability,challenger_probability,outcome) VALUES (?,?,?,?,?)",
                       (900*(i+1),900*i,p,0.3,0))
    db.close()
    d = diagnostics(file, 20)
    assert d["drift_warning"] is True
    assert d["status"] == "ALERT"
    assert d["recent_brier"] > d["previous_brier"]


def test_dashboard_is_local_and_read_only(tmp_path):
    file = setup_db(tmp_path, 20)
    d = diagnostics(file, 20)
    path = tmp_path / "dashboard.html"
    write_dashboard(d, path)
    html = path.read_text()
    assert "QuantScale AI" in html
    assert "Research Monitor" in html
    assert "http://" not in html and "https://" not in html
    assert diagnostics(file, 20) == d


def test_missing_db_does_not_create(tmp_path):
    file = tmp_path / "missing.db"
    with pytest.raises(FileNotFoundError):
        diagnostics(file)
    assert not file.exists()
