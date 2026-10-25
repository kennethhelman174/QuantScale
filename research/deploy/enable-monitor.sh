#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(id -u) -ne 0 ]] || { echo "Run as normal user" >&2; exit 1; }
SRC=/opt/quantscale-research/current/research/deploy
[[ -f "$SRC/quantscale-monitor.service" ]] || { echo "Research monitor release not installed" >&2; exit 1; }
mkdir -p "$HOME/.config/systemd/user" "$HOME/quantscale-data"
cp "$SRC/quantscale-monitor.service" "$SRC/quantscale-monitor.timer" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now quantscale-monitor.timer
systemctl --user start quantscale-monitor.service
echo "Open $HOME/quantscale-data/dashboard.html locally or serve it through a separately secured web endpoint."
