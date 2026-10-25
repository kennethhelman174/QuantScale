"""Read-only online learning diagnostics.

Measurements use only predictions with resolved outcomes; never interpret
synthetic historical replay as forward performance. No model mutations here.
"""
from __future__ import annotations

import argparse
import html
import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def _mean(xs):
    return sum(xs) / len(xs) if xs else None


def diagnostics(db_path: str | Path, window: int = 100) -> dict:
    if window < 20 or window > 10000:
        raise ValueError("window must be between 20 and 10000")
    path = Path(db_path)
    if not path.is_file():
        raise FileNotFoundError(f"No model database at {path}")
    # Query-only SQLite connection also prevents accidental schema creation.
    db = sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True)
    try:
        state = db.execute("SELECT scored_count,promotions FROM model_state WHERE singleton=1").fetchone()
        if state is None:
            raise ValueError("Missing learner state")
        # ORDER BY target_ts ASC yields chronological, *resolved* observations only.
        rows = db.execute(
            "SELECT target_ts,probability,challenger_probability,outcome "
            "FROM predictions WHERE outcome IS NOT NULL ORDER BY target_ts"
        ).fetchall()
        pending = db.execute("SELECT COUNT(*) FROM predictions WHERE outcome IS NULL").fetchone()[0]
        latest = db.execute(
            "SELECT target_ts,probability,challenger_probability FROM predictions "
            "WHERE outcome IS NULL ORDER BY target_ts DESC LIMIT 1"
        ).fetchone()
    finally:
        db.close()
    for t, p, cp, y in rows:
        if not all(math.isfinite(x) and 0 <= x <= 1 for x in (p, cp)) or y not in (0, 1):
            raise ValueError(f"Invalid scored prediction at {t}")
    recent = rows[-window:]
    previous = rows[-2*window:-window]
    def score(items, pos):
        return _mean([(r[pos] - r[3]) ** 2 for r in items])
    recent_brier = score(recent, 1)
    previous_brier = score(previous, 1)
    challenger_brier = score(recent, 2)
    base_rate = _mean([r[3] for r in recent])
    constant_baseline = _mean([(base_rate - r[3]) ** 2 for r in recent]) if base_rate is not None else None
    # Diagnostic-only flags, not proof of genuine statistical drift.
    enough = len(recent) >= window and len(previous) >= window
    deterioration = enough and recent_brier > previous_brier + 0.025
    worse_than_base = len(recent) >= window and recent_brier > constant_baseline + 0.01
    calibrated = []
    for index in range(5):
        bucket = [r for r in recent if min(int(r[1] * 5), 4) == index]
        calibrated.append({"range": f"{index * 20}-{(index + 1) * 20}%",
                           "count": len(bucket),
                           "predicted": _mean([r[1] for r in bucket]),
                           "observed": _mean([r[3] for r in bucket])})
    return {
        "status": "ALERT" if deterioration or worse_than_base else ("INSUFFICIENT_DATA" if len(recent) < window else "MONITORING"),
        "drift_warning": bool(deterioration),
        "underperforming_constant_baseline": bool(worse_than_base),
        "alert_is_statistical_test": False,
        "scored_predictions": len(rows),
        "pending_predictions": pending,
        "learner_scored_count": state[0],
        "research_promotions": state[1],
        "window": window,
        "recent_brier": recent_brier,
        "previous_brier": previous_brier,
        "challenger_brier": challenger_brier,
        "constant_rate_brier": constant_baseline,
        "calibration": calibrated,
        "latest_unresolved": {
            "target_utc": datetime.fromtimestamp(latest[0], timezone.utc).isoformat(),
            "champion_probability_up": latest[1],
            "challenger_probability_up": latest[2],
        } if latest else None,
        "caveat": "Research replay may include historical backfill. Not proof of forward trading performance.",
    }


def write_dashboard(report: dict, destination: str | Path) -> None:
    """Local, self-contained HTML; never embeds credentials or sends data."""
    def fmt(n):
        return "n/a" if n is None else f"{n:.4f}"
    def cell(label, val):
        return f"<section><h2>{html.escape(label)}</h2><strong>{html.escape(str(val))}</strong></section>"
    buckets = "".join(
        f"<tr><td>{html.escape(b['range'])}</td><td>{b['count']}</td>"
        f"<td>{fmt(b['predicted'])}</td><td>{fmt(b['observed'])}</td></tr>"
        for b in report["calibration"]
    )
    content = """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QuantScale Research Monitor</title>
<style>body{background:#101724;color:#e9eff8;font:16px system-ui;margin:0 auto;max-width:1050px;padding:24px}
header{border-bottom:1px solid #34445e;margin-bottom:25px;padding-bottom:15px}small{color:#aebdd0}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
section{background:#202d42;padding:20px;border-radius:12px}h2{font-size:14px;color:#acc0dd}
strong{font-size:25px}table{border-collapse:collapse;width:100%;margin-top:15px}
td,th{border-bottom:1px solid #33465f;text-align:left;padding:12px}
p{line-height:1.5}.note{color:#b6c7da}</style></head><body>
<header><h1>QuantScale AI · Research Monitor</h1><small>Read-only diagnostics · no live trading</small></header>
<main>"""
    content += cell("Model health", report["status"])
    content += cell("Scored predictions", report["scored_predictions"])
    content += cell("Pending predictions", report["pending_predictions"])
    content += cell("Recent Brier loss (lower is better)", fmt(report["recent_brier"]))
    content += cell("Challenger Brier", fmt(report["challenger_brier"]))
    content += cell("Research promotions", report["research_promotions"])
    content += """</main><h2>Probability calibration</h2><table>
<thead><tr><th>Probability bucket</th><th>Samples</th><th>Mean forecast</th><th>Observed UP rate</th></tr></thead><tbody>"""
    content += buckets + "</tbody></table>"
    content += "<p class='note'>" + html.escape(report["caveat"]) + "</p>"
    content += "<p class='note'>Generated from the most recently recorded outcomes. Reload after the next learning cycle.</p>"
    content += "</body></html>"
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    import os, tempfile
    fd, tmp = tempfile.mkstemp(prefix=".monitor-", suffix=".html", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def main():
    parser = argparse.ArgumentParser(description="Read-only learning diagnostics")
    parser.add_argument("--db", default=str(Path.home() / "quantscale-data" / "online.sqlite3"))
    parser.add_argument("--window", type=int, default=100)
    parser.add_argument("--html", dest="html_file", default=None)
    args = parser.parse_args()
    report = diagnostics(args.db, args.window)
    if args.html_file:
        write_dashboard(report, args.html_file)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
