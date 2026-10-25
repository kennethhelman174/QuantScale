# QuantScale AI research foundation v0.1

**NO LIVE ORDERS. NO EXCHANGE CREDENTIALS.** This is an isolated Python research module separate from the existing TypeScript trading service.

The source is on the `research-foundation` branch under `research/`. The existing TypeScript app on `main` has not been modified.

## Local test

```bash
cd research
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
.venv/bin/python -m pytest -q
.venv/bin/quantscale sample.csv
```

The input is synthetic sample data; there is no model training or real exchange-data import yet. Fees are placeholders and profits are not indicative of real performance.

## VM deployment

The optional read-only updater script in `research/deploy/` tracks only the `research-foundation` branch, validates every candidate version in a fresh venv, then updates the research release symlink. It never restarts or installs the existing trading app. Updates require successful local checks and should not be used for live execution code.

**Note:** The repository was public when this branch was created. Do not commit trading credentials or private market datasets.
