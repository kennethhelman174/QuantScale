# Paper trading acceptance gates

QuantScale and the Python Kalshi micro-scalper are independent paper engines. A healthy Python snapshot is not permission to place QuantScale orders.

## Gate A: observation (available now)
- QuantScale /api/health reports database ready, primary writer, PAPER.
- /api/python-paper/status reports a fresh Python execution identity and independent equity; the Python dashboard owns that wallet.
- /api/paper/readiness reports detailed failures. A failing check must not be hidden by a successful web server health check.
- No direct browser or bridge order submission. No live credentials shared with web clients.

## Gate B: controlled paper fills (NOT authorized for QuantScale yet)
- Identify *real* active KXBTC15M contracts from exchange metadata, and the exact YES/NO settlement convention.
- Verify official BRTI open and close reference windows; never substitute Coinbase spot as official settlement evidence.
- Verify side-specific book best bid/ask, freshness, tradable size, market phase, tick size, and market changes.
- Implement deterministic paper fill simulator using realistic cross-spread, available depth, fees and latency. Do not assume a fill for each signal.
- Enforce idempotent order/position identifiers, maximum exposure, loss and drawdown limits, entry cutoff near expiry, stale-feed pauses, and recovery behavior.
- Independently reconcile each paper trade against persisted entry, exit, fees, slippage, cash and position.
- Test exchange closure / market rollover / disconnected feed / restart / cancellation / partial fill / duplicate event with replay fixtures. Keep source-identified fixtures.
- Verify position settlement from official outcomes (once only), including restarts and missing outcomes.
- Record actual strategy decisions separately from shadow research and synthetic demonstrations.

## Gate C: automated paper (blocked)
- Gate B replay tests pass in CI; end-to-end sample reviewed.
- Out-of-sample market-separated calibration and fee-inclusive performance analyzed with uncertainty.
- User explicitly authorizes automation after reviewing risk budgets.

## Gate D: LIVE (not in scope)
No live orders, no live arm switch and no inferred permission to trade live.
