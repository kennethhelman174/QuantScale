# Incremental learning research v0.2

The learner is an **online logistic regression research baseline**, not an
LLM agent, autonomous profitable strategy, or Kalshi prediction model.

- Every 5 minutes (when enabled) a systemd timer downloads the previous 7
  days of **completed** public Coinbase BTC-USD 15-minute candles.
- It stores and deduplicates the candles in SQLite, rejects contradictory
  rewrites, and performs chronological predict-then-update analysis.
- The target is whether the **next 15-minute Coinbase close** is higher than
  the previous close. This is **not equivalent** to a Kalshi contract outcome.
- Labels are only evaluated after the target candle has closed. Historical
  backfill is evaluated sequentially, not shown as live forward performance.
- Learning adjusts challenger weights from each newly resolved observation.
  It can automatically promote the challenger based on an illustrative rolling
  Brier score comparison after 50 labeled observations.
- This v0.2 gate is for research only. It does **not** have an independent
  future holdout, statistical significance test, freeze window, or drift
  quarantine, so live promotion is prohibited.
- The live-order engine is not connected and this package has no order API.

Enable on Ubuntu after the research updater has installed the new release:

```bash
bash /opt/quantscale-research/current/research/deploy/enable-learning.sh
```

Inspect logs:

```bash
journalctl --user -u quantscale-learning.service -n 50 --no-pager
```

The application code updater and the model-learning timer are independent.
Both run on a nominal five-minute interval. They do not self-modify source.
