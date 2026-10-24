# QuantScale — Production Architecture & Raspberry Pi 4 Deployment

**QuantScale (K-Alpha)** is a 24/7 autonomous, persistent, single-writer quantitative trading engine for **Kalshi Bitcoin 15-Minute Prediction Markets**.

---

## Key Features

1. **Persistent 24/7 Engine**:
   - Single-writer process lock (`.engine.lock`) running on Node.js 22 LTS (ARM64).
   - Operates continuously without requiring an open web browser.
   - Prevents duplicate trading loops when multiple dashboard clients connect over WebSockets/REST.

2. **Isolated Operating Modes**:
   - **SIMULATION**: Offline synthetic price and market generation for backtesting.
   - **PAPER (Default)**: Real market spot prices (Coinbase) and Kalshi order books, with simulated fills and paper wallet ($1,000 initial bankroll).
   - **LIVE**: Real market prices with server-side authenticated live Kalshi order routing (`AUTHORIZE REAL MONEY` passphrase required).

3. **Durable SQLite WAL Database (`/data/quantscale/quantscale.db`)**:
   - Stores trading sessions, order state machine lifecycle, fills, positions, settlements, paper wallet transactions, cash ledger, risk events, and diagnostics.
   - All financial accounting operations are stored in exact integer cents.

4. **10-Minute GitHub Auto-Update Pipeline**:
   - Automated pull, build validation (`npm run lint`), health check, and graceful restart or rollback on branch `main` at `https://github.com/kennethhelman174/QuantScale`.

---

## Raspberry Pi 4 Quick Setup

```bash
# 1. Clone Repository
git clone https://github.com/kennethhelman174/QuantScale.git
cd QuantScale

# 2. Run Production Installer
bash scripts/install.sh

# 3. Start Systemd Service
bash scripts/start.sh

# 4. Check Engine Status
bash scripts/status.sh
```

---

## Remote Access via Tailscale & Nginx

The application binds to `localhost:3000` by default and is proxied via Nginx (`scripts/quantscale.nginx.conf`). Access securely from any phone, laptop, or tablet via Tailscale:

```bash
sudo tailscale up
```

---

## How to Commit Changes to GitHub

To commit local updates to GitHub:

```bash
git add .
git commit -m "feat: upgrade persistent backend engine and scatter plot analytics"
git push origin main
```
