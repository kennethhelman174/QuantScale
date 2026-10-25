#!/usr/bin/env bash
set -Eeuo pipefail
test "$(id -u)" -ne 0 || { echo "Run as the quantscale VM user" >&2;exit 1; }
DIR=/opt/quantscale-research/current/research/deploy
test -f "$DIR/quantscale-unified.service"
mkdir -p "$HOME/.config/systemd/user"
cp "$DIR/quantscale-unified.service" "$DIR/quantscale-unified.timer" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now quantscale-unified.timer
systemctl --user start quantscale-unified.service
echo "Report at $HOME/quantscale-data/unified.html"
