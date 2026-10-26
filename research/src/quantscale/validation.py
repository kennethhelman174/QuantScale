"""v0.8 conservative forward-only model validation and quarantine advisory.

This module never mutates learner weights, submits orders, or promotes models.
Statistical checks are exploratory safeguards, not proof of future returns.
"""
from __future__ import annotations
import argparse
import json
import math
import sqlite3
import time
from pathlib import Path

MODELS=("momentum","range","combined")
MIN_PAIRS=200
MIN_GAIN=0.01
BLOCK=8
Z=2.58  # conservative approximate 99% one-sided normal cutoff


def inspect(db_path, minimum=MIN_PAIRS):
    if minimum < 40: raise ValueError("minimum must be >= 40")
    path=Path(db_path)
    if not path.is_file(): raise FileNotFoundError(path)
    db=sqlite3.connect(f"file:{path.resolve()}?mode=ro",uri=True)
    results=[]
    try:
        for model in MODELS:
            rows=db.execute("""
                SELECT a.target_ts,a.probability,b.probability,a.outcome,b.outcome
                FROM forecasts a JOIN forecasts b ON a.target_ts=b.target_ts
                WHERE a.model=? AND b.model='constant_50'
                  AND a.origin='forward' AND b.origin='forward'
                  AND a.outcome IS NOT NULL AND b.outcome IS NOT NULL
                ORDER BY a.target_ts
            """,(model,)).fetchall()
            if any(a!=b or a not in (0,1) or not math.isfinite(p) or not math.isfinite(q)
                   or not (0<=p<=1 and 0<=q<=1) for _,p,q,a,b in rows):
                raise ValueError("invalid paired forward outcomes")
            # Last N pairs only; no model-selection decisions from historical backfills.
            latest=rows[-minimum:]
            n=len(latest)
            differences=[(q-y)**2-(p-y)**2 for _,p,q,y,_ in latest]
            gain=sum(differences)/n if n else None
            blocks=[differences[i:i+BLOCK] for i in range(0,n,BLOCK)]
            means=[sum(b)/len(b) for b in blocks if len(b)==BLOCK]
            uncertainty=(math.sqrt(sum((v-sum(means)/len(means))**2 for v in means)/(len(means)-1)/len(means))
                         if len(means)>=3 else None)
            conservative_lower=(gain-Z*uncertainty) if gain is not None and uncertainty is not None else None
            # Drift heuristic checks late-window loss against preceding window.
            half=n//2
            earlier=[(p-y)**2 for _,p,_,y,_ in latest[:half]]
            later=[(p-y)**2 for _,p,_,y,_ in latest[half:]]
            drift=n>=minimum and (sum(later)/len(later)-sum(earlier)/len(earlier)>0.025)
            quarantined=bool(drift or (n>=minimum and gain is not None and gain < -0.01))
            eligible=(n>=minimum and conservative_lower is not None and
                      conservative_lower>0 and gain>=MIN_GAIN and not quarantined)
            results.append({"model":model,"paired_forward":n,"mean_brier_gain":gain,
                            "approx_lower_gain":conservative_lower,
                            "drift_warning":bool(drift),"quarantined":quarantined,
                            "eligible_for_manual_review":bool(eligible),
                            "reason":"quarantined" if quarantined else
                                     "insufficient_forward_pairs" if n<minimum else
                                     "uncertain_or_small_gain" if not eligible else "manual_review_only"})
        return {"models":results,"automatic_promotion":False,"trading_enabled":False,
                "statistical_note":"Nonoverlapping 8-observation block normal approximation; exploratory, not a calibrated guarantee."}
    finally: db.close()


def persist_report(report, path, now=None):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    with sqlite3.connect(path) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS validation_history (
          recorded_at INTEGER NOT NULL, model TEXT NOT NULL,
          paired INTEGER NOT NULL, quarantined INTEGER NOT NULL,
          eligible INTEGER NOT NULL, details TEXT NOT NULL,
          PRIMARY KEY(recorded_at,model))""")
        timestamp=int(time.time()) if now is None else int(now)
        for row in report["models"]:
            db.execute("INSERT OR REPLACE INTO validation_history VALUES(?,?,?,?,?,?)",
                       (timestamp,row["model"],row["paired_forward"],int(row["quarantined"]),
                        int(row["eligible_for_manual_review"]),json.dumps(row,allow_nan=False)))
        db.commit()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--lab",default=str(Path.home()/"quantscale-data"/"laboratory.sqlite3"))
    parser.add_argument("--db",default=str(Path.home()/"quantscale-data"/"governance.sqlite3"))
    args=parser.parse_args()
    report=inspect(args.lab)
    persist_report(report,args.db)
    print(json.dumps(report,indent=2))

if __name__=="__main__":main()
