#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(id -u) -ne 0 ]] || { echo "Use unprivileged VM user"; exit 1; }
SRC=/opt/quantscale-research/current/research/deploy
test -f "$SRC/quantscale-lab.service"
mkdir -p "$HOME/.config/systemd/user"
cp "$SRC/quantscale-lab.service" "$SRC/quantscale-lab.timer" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now quantscale-lab.timer
systemctl --user start quantscale-lab.service
journalctl --user -u quantscale-lab.service -n 15 --no-pager
