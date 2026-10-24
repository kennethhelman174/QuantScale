# QuantScale pre-trading audit — 2026-10-24

## Scope
Read-only GitHub source audit of deployment, UI, Kalshi feed, forecasting, accounting, and tests. Does not establish Pi runtime or live exchange reliability.

## Verified implementation
- Versioned, locked, test-before-activate Raspberry Pi deployment with restart/health rollback.
- Persistent SQLite wallet and position ledgers in WAL mode.
- Read-only official Kalshi market and settlement observers; official settlement outcomes are immutable.
- Research-only Coinbase proxy, hypothetical quotes, and Brier framework.
- PAPER auto-resume blocked until contract-specific pricing/settlement correctness.

## Release-blocking findings
1. Legacy engine uses generated synthetic current markets and fixed-strike pricing; KXBTC15M is a CF BRTI 15-minute change contract. Keep exchange execution and automatic trading disabled.
2. Real Kalshi REST observation is separate from the engine's authorized order source. Do not assume quote availability implies executable signal.
3. Official settlement observer is not connected to paper-position cash and P&L; avoid automatic payouts until a single, transactionally consistent accounting model is implemented and reconciled with fees, collateral and restarts.
4. Probability calibration currently gets an empty array, with no timestamped pre-outcome predictions paired with exchange settlements.
5. Dashboard retains prior market state when packets report null; must clearly show no exchange market instead of legacy market.
6. Current depth parser requires orderbook_fp, but real exchange orderbook parsing and fractional precision must be verified with captured live responses.
7. Explicit 'resume' control must remain fail-closed; include CI regression test.

## Secondary findings
- Research costs use illustrative quadratic fees; not execution-grade without comparing official fee schedule and actual fills.
- Strict edge/fee model, price feed gaps, outage handling, rollover, partial fills, and settlement restart replay lack full integration coverage.
- Client-side legacy sqlite/sql.js and other npm dependencies appear potentially redundant but dependency removal should be proven with imports, bundle analysis and a rollback build.
- Frontend build carries large bundle warning and Vite configLoader warning; performance maintenance, not a trading correctness blocker.
- Pi cron/systemd journal visibility has been inconsistent; record service health metrics and explicit feed-state changes.

## Safe cleanup policy
Do NOT delete runtime SQLite DB, WAL/SHM files, backups, deployed releases, worktrees, config secrets, snapshots, or persisted financial records. Do not change LIVE disablement. Do not mass-prune packages or source modules without dependency proof. Keep any cleanup isolated on branch and covered by tests.

## Acceptance tests before automated PAPER mode
1. One-hour+ observed real, active market ticker/quote freshness and rollover; no synthetic price fallback.
2. Correct KXBTC15M rules including CF Benchmarks 60-second opening and closing reference averages and tie outcome.
3. Matching market IDs across discovery, quotes, research, orders and official settlements.
4. Realistic fill simulator with price/size/fees/slippage and expiry handling.
5. Wallet entry, exit, collateral and settlement P&L tested with exactly-once replay and restart injection.
6. Data collection and walk-forward probability calibration with official labels.
7. UI and REST truthfulness with stale feeds, null market, no liquidity, connection loss, two concurrent clients.
8. Raspberry Pi smoke test, backup restoration, rollback and no authorized LIVE execution.
