# v0.6 Unified Laboratory Dashboard

Static, read-only HTML dashboard generated every five minutes. Requires
existing learner SQLite DB, and optionally the lab DB (missing lab DB
shows no model data). The `unified.html` file uses no external assets.
It separates scored genuinely-forward forecasts from backfill and
shows Brier loss per model. No trade execution or automatic promotion.

Run after the automatic research updater has installed v0.6:

```bash
bash /opt/quantscale-research/current/research/deploy/enable-unified.sh
```

View through existing Mac SSH tunnel at
`http://localhost:8085/unified.html` after starting the localhost-only
Python file server on the VM. The page itself is static; browser refresh
is required to read a newly generated file.
