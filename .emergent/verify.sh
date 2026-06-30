#!/bin/bash
# verify.sh - Check all fixes are correctly applied
set -uo pipefail
echo "=== verify.sh $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
PASS=0
FAIL=0

check() {
    local label="$1" result="$2"
    if [ "$result" = "0" ]; then
        echo "[PASS] $label"
        PASS=$((PASS + 1))
    else
        echo "[FAIL] $label"
        FAIL=$((FAIL + 1))
    fi
}

# 1. package.json postinstall has no recursive expo install --fix
if grep '"postinstall"' /app/frontend/package.json | grep -q 'expo install --fix'; then
    check "postinstall clean (no expo install --fix)" "1"
else
    check "postinstall clean (no expo install --fix)" "0"
fi

# 2. supervisor config uses --lan not --tunnel
SC="/etc/supervisor/conf.d/supervisord.conf"
if [ -f "$SC" ]; then
    grep -q -- '--tunnel' "$SC"
    R1=$?
    grep -q -- '--lan' "$SC"
    R2=$?
    if [ $R1 -ne 0 ] && [ $R2 -eq 0 ]; then check "supervisor expo uses --lan" "0"
    else check "supervisor expo uses --lan (has --tunnel or missing --lan)" "1"; fi
else
    check "supervisor config exists" "1"
fi

# 3. boot hook installed
if [ -f "/root/.emergent/on-restart.sh" ] && grep -qF "apply-deferred.sh" "/root/.emergent/on-restart.sh"; then
    check "boot hook wired" "0"
else
    check "boot hook wired" "1"
fi

# 4. port 3000 (expo)
ss -tlnp 2>/dev/null | grep -q ':3000'
check "port 3000 (expo) listening" "$?"

# 5. port 8001 (backend)
ss -tlnp 2>/dev/null | grep -q ':8001'
check "port 8001 (backend) listening" "$?"

# 6. port 8010 (MCP)
ss -tlnp 2>/dev/null | grep -q ':8010'
check "port 8010 (MCP) listening" "$?"

# 7. MongoDB
mongosh --eval 'db.adminCommand("ping")' --quiet 2>/dev/null | grep -q 'ok'
check "MongoDB responsive" "$?"

echo ""
echo "Results: $PASS PASS, $FAIL FAIL"
if [ $FAIL -gt 0 ]; then
    echo "OVERALL: FAIL"
    exit 1
else
    echo "OVERALL: PASS"
    exit 0
fi
