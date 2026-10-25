# Bitcoin historical candle collector

The **public, read-only** Coinbase Exchange REST collector is independent from
the historical binary-market replay. It does not require exchange credentials
and does not place orders.

After the research updater has completed:

```bash
cd /opt/quantscale-research/current/research
../venv/bin/python -m quantscale.coinbase --start 2026-10-01T00:00:00Z --end 2026-10-02T00:00:00Z --granularity 900 --output /home/quantscale/quantscale-data/btc_20261001.csv
```

It uses fixed-size requests, UTC boundary checks, finite OHLCV validation,
duplicate detection, and atomic CSV output. Missing candles are counted, not
invented. This is an initial dataset ingestion utility, **not** a full
historical repository, research database, machine-learning system, or
realistic Kalshi fill simulator.

The updater does not restart research jobs when it changes the versioned
symlink. Avoid running a collection job concurrently with a release switch.
