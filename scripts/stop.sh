#!/usr/bin/env bash
# Stop QuantScale Daemon
echo "Stopping QuantScale background service gracefully..."
sudo systemctl stop quantscale.service
echo "QuantScale stopped."
