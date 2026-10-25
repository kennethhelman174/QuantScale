#!/usr/bin/env bash
set -Eeuo pipefail
test "$(id -u)" -ne 0 || { echo "Run as regular quantscale account"; exit 1; }
SRC=/opt/quantscale-research/current/research/deploy
test -f "$SRC/quantscale-governance.service"
mkdir -p "$HOME/.config/systemd/user"
cp "$SRC/quantscale-governance.service" "$SRC/quantscale-governance.timer" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now quantscale-governance.timer
systemctl --user start quantscale-governance.service
echo "Hourly governance audit enabled. Model promotion remains disabled."
