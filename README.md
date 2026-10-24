# QuantScale — Raspberry Pi 4 safe PAPER preview

This is a **safety preview**, not a production trading system. It runs an independent backend, receives a live Coinbase BTC spot feed, writes server data to SQLite WAL, and serves a remote dashboard. **Real Kalshi market discovery and order-book ingestion are not yet verified.** PAPER orders deliberately **do not execute** until a fresh genuine Kalshi order book is available. LIVE orders are disabled at the server, and browser-local trading is disabled.

## Install on Raspberry Pi 4

Requirements: Raspberry Pi OS **64-bit**, a Pi 4, reliable power, internet, SSH, and ideally 4 GB+ RAM and an SSD.

From an SSH terminal on your Pi:

    sudo apt update && sudo apt install -y git
    git clone --branch fix/pi4-safe-deployment-20261024 https://github.com/kennethhelman174/QuantScale.git
    cd QuantScale
    bash scripts/install.sh

The installer sets up Node.js 22.13+, npm, a private server-admin key, a local-only backend on port 3000, Nginx on LAN port 80, a systemd user service, and a systemd user update timer. The updater tracks whichever branch was cloned. For a future main release, clone main instead.

Check status:

    systemctl --user status quantscale.service --no-pager
    systemctl --user list-timers --all | grep quantscale
    curl -fsS http://127.0.0.1:3000/api/health
    hostname -I

Open the dashboard from another device on your home LAN using the Pi address on port 80 (for example http://192.168.1.50).

## Updates, backups, recovery

Every ~10 minutes the timer fetches the configured GitHub branch. New versions are built and tested in separate worktrees, not inside the running directory. The updater runs npm ci, npm run lint, npm test and npm run build with isolated test data, makes a SQLite-consistent backup, atomically switches release directories, restarts the service and checks the local health endpoint. A failed release activates the previous application directory; database rollback is not automatic because it could discard trades.

Commands:

    systemctl --user start quantscale-update.service
    journalctl --user -u quantscale-update.service -n 60 --no-pager
    journalctl --user -u quantscale.service -n 60 --no-pager
    cat ~/.local/share/quantscale-app/deployed-commit
    bash scripts/backup.sh

Database: ~/.local/share/quantscale/data/quantscale.db

Backups: ~/.local/share/quantscale/backups/

Administrator environment: ~/.config/quantscale/environment (permission 600). Never commit or share this secret.

To change which branch gets updates, edit ~/.config/quantscale/deploy_branch (for example main after merging and validating the PR) and start the update service.

## Remote access

Connect your Raspberry Pi and devices to the same Tailscale tailnet; the dashboard is then reachable at the Pi Tailscale IP on port 80. Do not forward router ports to the Pi. Nginx serves read-only analytics to your trusted LAN/tailnet. Trading mutations require a server-side administrator credential, while the preview UI intentionally does not collect credentials.

## Current limitations

- No verified Kalshi order-book ingestion; PAPER trading is paused, not silently simulated.
- LIVE execution is disabled.
- Dashboard trading controls and browser wallet mutations are disabled while server controls are hardened.
- Actual Raspberry Pi ARM64 startup, multi-day stability and power-loss recovery are not yet hardware-tested.
- Earlier Git history contains a database file; untracking it now does not erase earlier public commits.
- The existing research strategy and simulator are not proof of a profitable strategy.

Do not use the preview for real-money trading. Use a separate DEMO/simulation environment for synthetic-data experiments, not PAPER.
