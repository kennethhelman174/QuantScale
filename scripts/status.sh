#!/usr/bin/env bash
# Check QuantScale Status
echo "=== QuantScale System Status ==="
sudo systemctl status quantscale.service --no-pager
echo ""
echo "=== Process & Memory Info ==="
ps aux | grep -i node | grep -v grep
echo ""
echo "=== Disk Space (/data/quantscale) ==="
df -h /data/quantscale
