#!/usr/bin/env bash
# Install from a git clone using: bash scripts/install.sh
set -Eeuo pipefail
if [ "$(uname -m)" != "aarch64" ]; then
  echo "This installer requires 64-bit Raspberry Pi OS (aarch64)." >&2
  exit 1
fi
SRC="$(cd "$(dirname "$0")/.." && pwd -P)"
echo "Installing QuantScale from $SRC"
sudo apt-get update
sudo apt-get install -y curl git nginx sqlite3 openssl rsync
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0])===22 && Number(process.versions.node.split(".")[1])>=13 ? 0 : 1)' ; then
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/quantscale-nodesource.sh
  sudo bash /tmp/quantscale-nodesource.sh
  sudo apt-get install -y nodejs
fi
mkdir -p "$HOME/.local/share/quantscale-app/releases" "$HOME/.local/share/quantscale/data" "$HOME/.config/quantscale" "$HOME/.config/systemd/user"
chmod 700 "$HOME/.config/quantscale" "$HOME/.local/share/quantscale/data"
printf '%s\n' "$SRC" > "$HOME/.config/quantscale/source_path"
if [ ! -e "$HOME/.config/quantscale/environment" ]; then
  umask 077
  printf 'NODE_ENV=production\nPORT=3000\nHOST=127.0.0.1\nDATA_DIR=%s\nADMIN_API_KEY=%s\nNODE_OPTIONS=--experimental-sqlite\n' "$HOME/.local/share/quantscale/data" "$(openssl rand -hex 32)" > "$HOME/.config/quantscale/environment"
fi
chmod 600 "$HOME/.config/quantscale/environment"
cp "$SRC/scripts/quantscale.service" "$HOME/.config/systemd/user/quantscale.service"
cp "$SRC/scripts/quantscale-update.service" "$HOME/.config/systemd/user/quantscale-update.service"
cp "$SRC/scripts/quantscale-update.timer" "$HOME/.config/systemd/user/quantscale-update.timer"
sudo cp "$SRC/scripts/quantscale.nginx.conf" /etc/nginx/sites-available/quantscale
sudo ln -sfn /etc/nginx/sites-available/quantscale /etc/nginx/sites-enabled/quantscale
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
sudo loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable quantscale.service
bash "$SRC/scripts/update.sh"
systemctl --user enable --now quantscale-update.timer
echo "Installation complete. Open http://$(hostname -I | awk '{print $1}') on your LAN."
echo "Status: systemctl --user status quantscale.service"
echo "Updater: systemctl --user list-timers"
