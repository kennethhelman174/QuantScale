"""QuantScale v0.7: conservative model-governance research gate.

No trading API, no automatic model promotion, no direct model mutation.
Candidate reviews require forward-only paired outcomes, independence since
last action, chronological testing and a cooldown. Snapshots are append-only.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sqlite3
import time
from pathlib import Path

BASELINE="constant_50"
CANDIDATES=("momentum","range","combined")
MIN_SAMPLES=200
COOLDOWN_SECONDS=24*3600
MIN_IMPROVEMENT=0.01

def db_open(path):
    path=Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(path,timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS audits(
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_utc INTEGER NOT NULL,
      action TEXT NOT NULL,
      candidate TEXT,
      details TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshots(
      snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_utc INTEGER NOT NULL,
      model TEXT NOT NULL,
      source_sha256 TEXT NOT NULL,
      weights_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decisions(
      decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_utc INTEGER NOT NULL,
      candidate TEXT NOT NULL,
      eligible INTEGER NOT NULL,
      reason TEXT NOT NULL,
      candidate_brier REAL,
      baseline_brier REAL,
      evaluated INTEGER NOT NULL
    );
    """)
    db.commit()
    return db

def models_with_forward_predictions(db, name):
    return db.execute(
        "SELECT a.target_ts,a.probability,a.outcome,b.probability,b.outcome "
        "FROM forecasts a JOIN forecasts b ON a.target_ts=b.target_ts "
        "WHERE a.model=? AND b.model=? AND a.origin='forward' "
        "AND b.origin='forward' AND a.outcome IS NOT NULL "
        "AND b.outcome IS NOT NULL ORDER BY a.target_ts",
        (name,BASELINE)).fetchall()

def review(lab_path, governance_path, now=None, *, minimum=MIN_SAMPLES):
    if minimum < 30:
        raise ValueError("minimum must be >= 30")
    now=int(time.time()) if now is None else int(now)
    source=Path(lab_path)
    if not source.is_file():
        raise FileNotFoundError("Lab model history not found")
    db=db_open(governance_path)
    lab=sqlite3.connect(f"file:{source.resolve()}?mode=ro",uri=True)
    decisions=[]
    try:
        for name in CANDIDATES:
            rows=models_with_forward_predictions(lab,name)
            valid=[r for r in rows if r[2] == r[4]]
            if len(valid) != len(rows) or any(
                not (math.isfinite(r[1]) and math.isfinite(r[3]) and 0<=r[1]<=1 and 0<=r[3]<=1 and r[2] in (0,1))
                for r in rows
            ):
                raise ValueError("Invalid paired forward predictions")
            sample=rows[-minimum:]
            count=len(sample)
            candidate_loss=sum((r[1]-r[2])**2 for r in sample)/count if count else None
            baseline_loss=sum((r[3]-r[4])**2 for r in sample)/count if count else None
            last=db.execute("SELECT MAX(event_utc) FROM audits WHERE action IN ('manual_promote','manual_rollback')").fetchone()[0]
            cooling=last is not None and now-last < COOLDOWN_SECONDS
            # Minimum realized improvement does not prove statistical significance.
            improvement=(baseline_loss-candidate_loss) if count else None
            eligible=count>=minimum and improvement is not None and improvement>=MIN_IMPROVEMENT and not cooling
            reason=("cooldown" if cooling else "insufficient_forward_samples" if count<minimum
                    else "below_improvement_threshold" if improvement<MIN_IMPROVEMENT
                    else "manual_review_only")
            decisions.append({"candidate":name,"eligible_for_manual_review":bool(eligible),
                              "reason":reason,"forward_paired_samples":count,
                              "candidate_brier":candidate_loss,"baseline_brier":baseline_loss,
                              "improvement":improvement})
        with db:
            for item in decisions:
                db.execute("INSERT INTO decisions(created_utc,candidate,eligible,reason,candidate_brier,baseline_brier,evaluated) VALUES(?,?,?,?,?,?,?)",
                           (now,item["candidate"],int(item["eligible_for_manual_review"]),item["reason"],
                            item["candidate_brier"],item["baseline_brier"],item["forward_paired_samples"]))
        return {"auto_promotion":False,"live_trading":False,"minimum_forward_pairs":minimum,
                "cooldown_seconds":COOLDOWN_SECONDS,"candidates":decisions,
                "warning":"Eligibility is a screening heuristic, not statistical proof or authorization to trade."}
    finally:
        lab.close()
        db.close()

def snapshot(lab_path, governance_path, model, now=None):
    if model not in CANDIDATES and model != BASELINE:
        raise ValueError("Unknown model")
    now=int(time.time()) if now is None else int(now)
    lab=sqlite3.connect(f"file:{Path(lab_path).resolve()}?mode=ro",uri=True)
    try:
        row=lab.execute("SELECT value FROM weights WHERE model=?",(model,)).fetchone()
        if row is None:raise ValueError("Model not found")
        parsed=json.loads(row[0])
        if len(parsed)!=4 or not all(isinstance(v,(float,int)) and math.isfinite(v) for v in parsed):
            raise ValueError("Invalid model weights")
        payload=json.dumps(parsed,separators=(",",":"),allow_nan=False)
    finally:lab.close()
    checksum=hashlib.sha256(payload.encode()).hexdigest()
    db=db_open(governance_path)
    try:
        with db:
            cur=db.execute("INSERT INTO snapshots(created_utc,model,source_sha256,weights_json) VALUES(?,?,?,?)",
                           (now,model,checksum,payload))
            db.execute("INSERT INTO audits(event_utc,action,candidate,details) VALUES(?,?,?,?)",
                       (now,"snapshot",model,json.dumps({"snapshot_id":cur.lastrowid,"sha256":checksum})))
        return {"snapshot_id":cur.lastrowid,"model":model,"sha256":checksum,
                "note":"Immutable copy stored; model remains unchanged."}
    finally:db.close()

def rollback_plan(governance_path, snapshot_id):
    """Read-only verified restore plan. Never writes model weights."""
    db=db_open(governance_path)
    try:
        row=db.execute("SELECT model,source_sha256,weights_json FROM snapshots WHERE snapshot_id=?",(snapshot_id,)).fetchone()
        if row is None:raise ValueError("Snapshot not found")
        model,digest,payload=row
        if hashlib.sha256(payload.encode()).hexdigest()!=digest:
            raise ValueError("Snapshot integrity check failed")
        return {"snapshot_id":snapshot_id,"model":model,"verified_sha256":digest,
                "requires_manual_restore":True,
                "trading_enabled":False}
    finally:db.close()

def main():
    parser=argparse.ArgumentParser(description="Research-only governance review")
    parser.add_argument("--lab",default=str(Path.home()/"quantscale-data"/"laboratory.sqlite3"))
    parser.add_argument("--db",default=str(Path.home()/"quantscale-data"/"governance.sqlite3"))
    parser.add_argument("--snapshot",choices=(*CANDIDATES,BASELINE))
    parser.add_argument("--rollback-plan",type=int)
    args=parser.parse_args()
    if args.rollback_plan is not None:
        result=rollback_plan(args.db,args.rollback_plan)
    elif args.snapshot:
        result=snapshot(args.lab,args.db,args.snapshot)
    else:
        result=review(args.lab,args.db)
    print(json.dumps(result,indent=2))

if __name__=="__main__":main()
