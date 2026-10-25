"""QuantScale v0.6 research-only combined static HTML report."""
from __future__ import annotations
import argparse
import html
import json
import sqlite3
import math
from datetime import datetime, timezone
from pathlib import Path
from .monitor import diagnostics

MODELS = ("constant_50", "momentum", "range", "combined")

def load_models(path, window=100):
    db_path = Path(path)
    if not db_path.is_file():
        return [{"name":name,"forward":0,"brier":None,"latest":None} for name in MODELS]
    db = sqlite3.connect(f"file:{db_path.resolve()}?mode=ro", uri=True)
    try:
        result=[]
        for name in MODELS:
            rows=db.execute("SELECT probability,outcome FROM forecasts WHERE model=? AND origin='forward' AND outcome IS NOT NULL ORDER BY target_ts DESC LIMIT ?",(name,window)).fetchall()
            latest=db.execute("SELECT target_ts,probability FROM forecasts WHERE model=? AND origin='forward' ORDER BY target_ts DESC LIMIT 1",(name,)).fetchone()
            valid=all(math.isfinite(p) and 0<=p<=1 and y in (0,1) for p,y in rows)
            if not valid: raise ValueError("Invalid probability/outcome values")
            brier=sum((p-y)**2 for p,y in rows)/len(rows) if rows else None
            result.append({"name":name,"forward":len(rows),"brier":brier,
                           "latest":{"target":datetime.fromtimestamp(latest[0],timezone.utc).isoformat(),"probability_up":latest[1]} if latest else None})
        return result
    finally:
        db.close()

def build(learner_db, laboratory_db, output):
    learner=diagnostics(learner_db)
    models=load_models(laboratory_db)
    def fmt(value):
        return "Not enough data" if value is None else f"{value:.4f}"
    items="".join(
        "<tr><td>"+html.escape(m["name"])+"</td><td>"+str(m["forward"])+
        "</td><td>"+fmt(m["brier"])+"</td><td>"+(
            fmt(m["latest"]["probability_up"]) if m["latest"] else "n/a")+
        "</td></tr>" for m in models)
    initial=json.dumps({"models":models, "learner":learner},allow_nan=False).replace("<","\\u003c")
    document="""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QuantScale AI — Model Laboratory</title><style>
:root{color-scheme:dark}body{margin:0;background:#0b1422;color:#ecf2fa;font:15px system-ui,sans-serif}
.container{max-width:1150px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
small,.muted{color:#b1c0d2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:24px 0}
.card{background:#1d2c41;padding:18px;border-radius:12px;border:1px solid #30435b}.value{font-size:26px;font-weight:700;margin-top:10px}
table{border-collapse:collapse;width:100%;background:#15253a}th,td{padding:13px;text-align:left;border-bottom:1px solid #34506d}
th{color:#bbcee5}section{overflow-x:auto;margin:20px 0}.warn{color:#ffc978}.ok{color:#91e8c1}
button{background:#294365;color:white;border:1px solid #567da7;border-radius:8px;padding:10px;cursor:pointer}
canvas{width:100%;height:230px;background:#132237;border-radius:8px}
</style></head><body><div class="container"><header><div><h1>QuantScale AI · Research Laboratory</h1><small>Forward-only scoring · Research / paper-only · No trading controls</small></div><button onclick="location.reload()">Refresh</button></header>
<div class="grid">
<div class="card">Model status<div class="value">""" + html.escape(learner["status"])+"""</div></div>
<div class="card">Forward outcomes<div class="value">""" + str(learner["forward_scored"])+"""</div></div>
<div class="card">Legacy promotions<div class="value">""" + str(learner["historical_promotions"])+"""</div></div>
<div class="card">Automatic promotions<div class="value">DISABLED</div></div></div>
<h2>Model comparison</h2><section><table><thead><tr><th>Model</th><th>Forward evaluated*</th><th>Brier score (lower better)</th><th>Latest UP probability</th></tr></thead><tbody>""" + items + """</tbody></table></section>
<h2>Forward Brier comparison</h2><canvas id="comparison" width="920" height="250" aria-label="Brier score comparison chart"></canvas>
<p class="muted">*Counts cover up to the latest 100 resolved forward forecasts per model. Blank values mean no forward outcomes are available. Historical backfill is excluded.</p>
<p class="muted">Scores from a small sample do not establish an edge. This page refreshes only when the scheduled report generator runs; use Refresh to reload.</p>
<script id="snapshot" type="application/json">""" + initial + """</script>
<script>
const data=JSON.parse(document.getElementById('snapshot').textContent),cv=document.getElementById('comparison'),ctx=cv.getContext('2d');
const found=data.models.filter(m=>m.brier!==null); ctx.fillStyle='#bed0e8';ctx.font='15px system-ui';
if(!found.length) ctx.fillText('Awaiting real forward outcomes',35,60);
else {const max=Math.max(0.30,...found.map(m=>m.brier));found.forEach((m,i)=>{let y=25+i*55;ctx.fillStyle='#adc0dc';ctx.fillText(m.name,15,y+14);ctx.fillStyle='#718ff4';ctx.fillRect(190,y,Math.round((m.brier/max)*600),25);ctx.fillStyle='#f2f6ff';ctx.fillText(m.brier.toFixed(4),200+Math.round((m.brier/max)*600),y+18);});}
</script></div></body></html>"""
    out=Path(output);out.parent.mkdir(parents=True,exist_ok=True)
    import os,tempfile
    fd,tmp=tempfile.mkstemp(prefix=".unified-",suffix=".html",dir=out.parent)
    try:
        with os.fdopen(fd,"w") as fp:fp.write(document)
        os.replace(tmp,out)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    return {"output":str(out),"models":models,"status":learner["status"]}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--learner",default=str(Path.home()/"quantscale-data"/"online.sqlite3"))
    p.add_argument("--lab",default=str(Path.home()/"quantscale-data"/"laboratory.sqlite3"))
    p.add_argument("--output",default=str(Path.home()/"quantscale-data"/"unified.html"))
    a=p.parse_args();print(json.dumps(build(a.learner,a.lab,a.output),indent=2))
if __name__=="__main__":main()
