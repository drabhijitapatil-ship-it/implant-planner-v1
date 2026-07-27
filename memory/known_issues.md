
## Dev-only console warning (pre-existing, NOT user-visible) — 2026-07-22
- "Unexpected text node: . A text node cannot be a child of a <View>" fires ~8x on ANY
  case-detail open (even cases with no transfer), 12x on transfer cases. Emitted by
  react-native-web View child validation (no component stack available). The offending
  child is an empty string somewhere in /app/frontend/app/procedures/[id].tsx (5900 lines).
  Confirmed pre-existing before iter-383 changes. Dev bundle only; harmless in production.

## Alert.alert is a no-op on RN-Web (web preview only) — noted 2026-07-27
- handleContinueToImplants and other flows use Alert.alert; on web builds nothing shows
  (works fine on native/Expo Go — the user's actual platform). If web becomes a first-class
  target, replace with a custom in-app modal. Testing agents cannot capture these popups.

## Text-node warning hunt attempt #2 (2026-07-27)
- Tried patching react-native-web View/index.js to throw with component stack — Metro cached
  transform prevented it from taking effect; reverted. Warning remains dev-only cosmetic.
  If attempting again: patch node_modules FIRST, then `sudo supervisorctl restart expo` after
  clearing /app/frontend/node_modules/.cache, wait for full rebundle (~60s), then load page.
