# v0.7 research model governance

A separate read-only evaluator compares paired **forward** predictions
against a constant-50% baseline. Requires at least 200 matched samples
and a 0.01 Brier improvement for manual-review eligibility. These are
screening heuristics, **not evidence of statistical significance**.

A 24-hour cooldown is reserved for future manual promotion/rollback
events. No promotion command or actual rollback mutation is implemented
in v0.7: `--rollback-plan N` verifies an immutable weight snapshot and
reports the manual-restore requirement. `--snapshot MODEL` captures a
SHA-256 checked copy in separate governance SQLite storage.

Every governance review is recorded in `~/quantscale-data/governance.sqlite3`.
Historic backfills are excluded from candidate eligibility. This process
cannot submit live financial orders, modify research-model weights, or
change the existing TypeScript trader.

Enable after GitHub checks pass:

```bash
bash /opt/quantscale-research/current/research/deploy/enable-governance.sh
```
