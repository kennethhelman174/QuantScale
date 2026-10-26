#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$(id -u)" -ne 0 ]] || { echo "Run as VM user" >&2;exit 1; }
SRC=/opt/quantscale-research/current/research/deploy
mkdir -p "$HOME/.config/systemd/user"
cp "$SRC/quantscale-validation.service" "$SRC/quantscale-validation.timer" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now quantscale-validation.timer
systemctl --user start quantscale-validation.service
