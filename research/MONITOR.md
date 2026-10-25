# QuantScale research dashboard v0.3

Monitoring, not execution. The research monitor reads the persistent SQLite
online-learner database and emits a self-contained HTML report at
`~/quantscale-data/dashboard.html` (no external JS, network requests,
credentials, or order endpoints).

Install once, after an updated research release passes checks:

```bash
bash /opt/quantscale-research/current/research/deploy/enable-monitor.sh
```

The dashboard generator runs approximately every five minutes, in addition
to the separately installed data-learning and code-update timers. It uses a
100-evaluation rolling Brier score, a challenger comparison, five calibration
bins, and heuristic deterioration flags.

A drift warning is an *operational heuristic*, not a statistically
validated concept-drift test. The learner still operates as in v0.2.
Do not interpret model scores computed during backfills as independent
forward results. Nothing here changes live trading behavior.
