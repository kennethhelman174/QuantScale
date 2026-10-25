# QuantScale v0.5 laboratory

Research-only: separate SQLite store, model comparison, no trading API.
Models: static 50% baseline; momentum-only; range-only; combined logistic.

Each run reads *completed* BTC candles from the v0.4 learner database.
The lab produces independent probability forecasts labeled **backfill** or
**forward**. Only genuinely forward forecasts count toward monitoring.

Initial release has no autonomous promotion or live execution. Model training
and more sophisticated evaluation will be introduced after replay/forward
provenance and timing are validated. No backfilled metrics are represented as
out-of-sample forward performance.

```bash
bash /opt/quantscale-research/current/research/deploy/enable-lab.sh
```
