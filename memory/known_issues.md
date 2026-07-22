
## Dev-only console warning (pre-existing, NOT user-visible) — 2026-07-22
- "Unexpected text node: . A text node cannot be a child of a <View>" fires ~8x on ANY
  case-detail open (even cases with no transfer), 12x on transfer cases. Emitted by
  react-native-web View child validation (no component stack available). The offending
  child is an empty string somewhere in /app/frontend/app/procedures/[id].tsx (5900 lines).
  Confirmed pre-existing before iter-383 changes. Dev bundle only; harmless in production.
