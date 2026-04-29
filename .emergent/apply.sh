#!/bin/bash
# apply.sh - Enforce desired state for dental-workflow-18
# Fixes: (1) supervisor expo --tunnel → --lan (ngrok stale tunnels crash expo)
#        (2) package.json postinstall recursive expo install --fix → OOM
#        (3) boot hook wiring
# Idempotent. Re-run safe.
set -euo pipefail
LOG="/app/.emergent/apply.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== apply.sh $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

CHANGED=0
SUPERVISOR_CONF="/etc/supervisor/conf.d/supervisord.conf"
BOOT_HOOK="/root/.emergent/on-restart.sh"
PKG_JSON="/app/frontend/package.json"

# --- prereqs ---
if [ ! -f "$PKG_JSON" ]; then
    echo "[FAIL] $PKG_JSON not found"; exit 1
fi

# --- Fix 1: boot hook ---
mkdir -p /root/.emergent
HOOK_MARKER="app/.emergent/apply-deferred.sh"
if [ ! -f "$BOOT_HOOK" ] || ! grep -qF "$HOOK_MARKER" "$BOOT_HOOK" 2>/dev/null; then
    cat > "$BOOT_HOOK" <<'HOOKEOF'
#!/bin/bash
# Boot hook: deferred fix applicator (runs in background so entrypoint continues)
nohup bash /app/.emergent/apply-deferred.sh >> /app/.emergent/apply.log 2>&1 &
HOOKEOF
    chmod +x "$BOOT_HOOK"
    echo "[OK] Boot hook installed: $BOOT_HOOK"
    CHANGED=1
else
    echo "[SKIP] Boot hook already correct"
fi

# --- Fix 2: supervisor config --tunnel → --lan ---
if [ -f "$SUPERVISOR_CONF" ]; then
    if grep -q -- '--tunnel' "$SUPERVISOR_CONF"; then
        sed -i 's|--tunnel|--lan|g' "$SUPERVISOR_CONF"
        echo "[OK] Patched supervisor expo: --tunnel → --lan"
        CHANGED=1
    else
        echo "[SKIP] Supervisor config already uses --lan (or no --tunnel found)"
    fi
else
    echo "[WARN] $SUPERVISOR_CONF not found yet (entrypoint hasn't populated it)"
fi

# --- Fix 3: package.json postinstall ---
if grep '"postinstall"' "$PKG_JSON" | grep -q 'expo install --fix'; then
    # Remove 'npx expo install --fix || true' and ' && npx expo install --fix || true' variants
    sed -i 's| && npx expo install --fix||g' "$PKG_JSON"
    sed -i 's| \|\| true"$|"/' "$PKG_JSON"  # clean trailing || true if orphaned
    # Verify it's gone
    if grep '"postinstall"' "$PKG_JSON" | grep -q 'expo install --fix'; then
        echo "[FAIL] Could not remove expo install --fix from postinstall"
        exit 1
    fi
    echo "[OK] Removed 'expo install --fix' from postinstall"
    CHANGED=1
else
    echo "[SKIP] postinstall already clean"
fi

# --- Reload if changes were made and supervisor is running ---
if [ $CHANGED -eq 1 ] && supervisorctl status >/dev/null 2>&1; then
    supervisorctl reread 2>/dev/null || true
    supervisorctl update 2>/dev/null || true
    if supervisorctl status expo 2>/dev/null | grep -q RUNNING; then
        supervisorctl restart expo
        echo "[OK] Expo restarted"
    fi
fi

echo "=== apply.sh done ==="
