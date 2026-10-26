# QuantScale v0.8

Forward-only paired loss differences, a conservative exploratory block-based
uncertainty bound, deterioration checks, and an auditable quarantine *advisory*.
Candidate promotion and rollback remain disabled; quarantines are recorded
in a separate SQLite governance database and do not alter execution.
Requires at least 200 forward pairs for manual-review eligibility.

After the research updater installs a tested commit:
```bash
bash /opt/quantscale-research/current/research/deploy/enable-validation.sh
```

This is not a trading performance guarantee. Model snapshots from v0.7 are
still available as integrity-verified **rollback plans**, not automatic restores.
