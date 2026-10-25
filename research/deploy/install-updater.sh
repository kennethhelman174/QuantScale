#!/usr/bin/env bash
set -Eeuo pipefail
BASE=/opt/quantscale-research
sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 755 "$BASE"
install -m 700 research/deploy/update.sh "$BASE/update.sh"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/quantscale-research-update.service" <<EOF
[Unit]
Description=QuantScale research-only update validation
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
ExecStart=$BASE/update.sh
EOF
cat > "$HOME/.config/systemd/user/quantscale-research-update.timer" <<'EOF'
[Unit]
Description=Hourly QuantScale research update check
[Timer]
OnBootSec=5min
OnUnitInactiveSec=1h
Persistent=true
RandomizedDelaySec=5min
[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user start quantscale-research-update.service
systemctl --user enable --now quantscale-research-update.timer
echo "Research-only auto updates enabled."
