#!/usr/bin/env bash
set -Eeuo pipefail
if [ "$(id -u)" -eq 0 ]; then
  echo "Run as an unprivileged Ubuntu account" >&2; exit 1
fi
BASE=/opt/quantscale-research/current
[[ -d "$BASE/research" ]] || { echo "Research release not installed" >&2; exit 1; }
mkdir -p "$HOME/.config/systemd/user" "$HOME/quantscale-data"
cp "$BASE/research/deploy/quantscale-learning.service" "$HOME/.config/systemd/user/"
cp "$BASE/research/deploy/quantscale-learning.timer" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now quantscale-learning.timer
systemctl --user start quantscale-learning.service
echo "Learning job installed; 5-minute cycles, no live trading."
systemctl --user list-timers --all | grep quantscale || true
