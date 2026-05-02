# Backlog — Saved Enhancements & Ideas

Use this as the running holding-tank for non-urgent enhancements the user wants to revisit. Keep entries short and timestamped.

---

## Cache-busting for Metro bundler (stale bundle recovery)
**When to use**: Tester reports the live preview still shows OLD behaviour even though the source file on disk has been updated, and `sudo supervisorctl restart expo` alone doesn't help.

```bash
rm -rf /app/frontend/.metro-cache /app/frontend/.expo /tmp/metro-*
sudo supervisorctl restart expo
sleep 30   # cold rebuild takes ~30s in CI mode (2263+ modules)
curl -s -o /dev/null http://localhost:3000   # trigger first request to kick bundler
tail -n 5 /var/log/supervisor/expo.out.log   # expect `Web Bundled ... (2263 modules)`
```

---

## Enhancement: First-Run Coach-Mark Tour for New Gesture Vocabulary
**Saved**: Feb 2026 (Iteration 131)
**Priority**: P2 (nice-to-have polish, not blocking any workflow)
**Context**: After the iter-118 Tile-Grid Menu and iter-123 global `<BackButton />` rollout, the app introduced new gesture/affordance vocabulary (circular floating back chip, 4-tile grid popover with haptics) that silently replaced older, more conventional UI (hamburger drawer, "← Back" text). Existing users may miss the new surfaces on their first login post-update.

**Proposed implementation**:
- 3-step coach-mark tour, fires once per user on first post-update app open.
- Step 1: Spotlight the tile-grid icon in the header → caption "Tap here for menu".
- Step 2: Spotlight the circular BackButton → caption "One-tap back, with a gentle haptic".
- Step 3: Spotlight the unread red dot on the menu icon → caption "Red dot = new Forum or What's New activity".
- Store `coach_mark_v1_seen: true` on the user record (or in SecureStore) so it never fires twice.
- Skippable via a small "Skip tour" link on every step.

**Why defer**:
- Not blocking any workflow.
- Better to ship after Microsoft Login / OpenAI key swap / EAS SDK decision so new signups also benefit automatically.
