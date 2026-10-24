#!/usr/bin/env bash
# QuantScale Raspberry Pi 4 ARM64 Production Installer Script

set -e

echo "=== QuantScale Raspberry Pi 4 Production Installer ==="

CURRENT_USER=$(whoami)

# 1. Update system packages
echo "[1/6] Updating system package list..."
sudo apt-get update -y
sudo apt-get install -y curl git nginx sqlite3 ufw

# 2. Install Tailscale via official repository script if missing
if ! command -v tailscale &> /dev/null; then
  echo "[2/6] Installing Tailscale for secure remote VPN access..."
  curl -fsSL https://tailscale.com/install.sh | sh || echo "Warning: Tailscale installation skipped. Install manually if remote VPN access is needed."
else
  echo "[2/6] Tailscale is already installed."
fi

# 3. Check or install Node.js 22
if ! command -v node &> /dev/null || [[ $(node -v) != v22* ]]; then
  echo "[3/6] Installing Node.js 22 LTS for ARM64..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"

# 4. Create persistent data directory outside repository and assign ownership
echo "[4/6] Setting up persistent SQLite database storage..."
sudo mkdir -p /data/quantscale
sudo chown -R $CURRENT_USER:$CURRENT_USER /data/quantscale
sudo chmod -R 755 /data/quantscale

# 5. Install dependencies and build project
echo "[5/6] Installing npm dependencies and building production assets..."
npm ci
npm run build

# 6. Configure Nginx reverse proxy and systemd service
echo "[6/6] Registering Nginx proxy and systemd service..."
if [ -d "/etc/nginx/sites-available" ]; then
  sudo cp scripts/quantscale.nginx.conf /etc/nginx/sites-available/quantscale
  sudo ln -sf /etc/nginx/sites-available/quantscale /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl reload nginx || true
fi

sudo cp scripts/quantscale.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable quantscale.service

echo "=== QuantScale Installation Complete ==="
echo "Run 'bash scripts/start.sh' or 'sudo systemctl start quantscale' to launch."
