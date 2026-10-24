#!/usr/bin/env bash
# QuantScale Raspberry Pi 4 ARM64 Production Installer Script

set -e

echo "=== QuantScale Raspberry Pi 4 Production Installer ==="

# 1. Update system packages
echo "[1/5] Updating system package list..."
sudo apt-get update -y
sudo apt-get install -y curl git nginx sqlite3 ufw tailscale

# 2. Check or install Node.js 22
if ! command -v node &> /dev/null || [[ $(node -v) != v22* ]]; then
  echo "[2/5] Installing Node.js 22 LTS for ARM64..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"

# 3. Create persistent data directory outside repository
echo "[3/5] Setting up persistent SQLite database storage..."
mkdir -p /data/quantscale
sudo chown -R $USER:$USER /data/quantscale

# 4. Install dependencies and build project
echo "[4/5] Installing dependencies and building production assets..."
npm ci
npm run build

# 5. Configure systemd service
echo "[5/5] Registering systemd service..."
sudo cp scripts/quantscale.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable quantscale.service

echo "=== QuantScale Installation Complete ==="
echo "Run 'bash scripts/start.sh' or 'sudo systemctl start quantscale' to launch."
