#!/bin/bash
# apply-deferred.sh - Background boot hook: waits for entrypoint to finish
# populating supervisor config, then applies fixes.
# Spawned by /root/.emergent/on-restart.sh (runs during entrypoint step 1).
# Must wait for entrypoint step 3+ (supervisor config sed substitutions).
set -uo pipefail
LOG="/app/.emergent/apply.log"
echo "=== apply-deferred $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"

SUPERVISOR_CONF="/etc/supervisor/conf.d/supervisord.conf"

# Wait for supervisor config to be populated (entrypoint substitutes {{NGROK_AUTHTOKEN}})
TIMEOUT=180
WAITED=0
while true; do
    if [ -f "$SUPERVISOR_CONF" ] && grep -q 'NGROK_AUTHTOKEN="[^{]' "$SUPERVISOR_CONF" 2>/dev/null; then
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $WAITED -ge $TIMEOUT ]; then
        echo "[FAIL] Timeout (${TIMEOUT}s) waiting for supervisor config" >> "$LOG"
        exit 1
    fi
done
echo "[OK] Supervisor config populated after ${WAITED}s" >> "$LOG"

# Small delay to ensure all seds in entrypoint are done
sleep 1

# Apply fixes
bash /app/.emergent/apply.sh

# Wait for supervisor to start, then verify expo is on --lan
WAITED=0
while ! supervisorctl status >/dev/null 2>&1; do
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $WAITED -ge $TIMEOUT ]; then
        echo "[FAIL] Timeout waiting for supervisor" >> "$LOG"
        exit 1
    fi
done

# If expo is crash-looping (--tunnel was active briefly), restart it
sleep 3
if ! ss -tlnp 2>/dev/null | grep -q ':3000'; then
    echo "[WARN] Port 3000 not listening, restarting expo" >> "$LOG"
    supervisorctl restart expo >> "$LOG" 2>&1
fi

echo "=== apply-deferred done ===" >> "$LOG"
