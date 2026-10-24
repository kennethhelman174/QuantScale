#!/usr/bin/env bash
# Start QuantScale Daemon
echo "Starting QuantScale 24/7 background service..."
sudo systemctl start quantscale.service
sudo systemctl status quantscale.service --no-pager
