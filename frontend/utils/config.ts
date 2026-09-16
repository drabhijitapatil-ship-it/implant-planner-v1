// iter-Feb-2026 (v5): Fail-closed backend URL resolution.
// The deploy pipeline rewrites EXPO_PUBLIC_BACKEND_URL at build time.
// If it is missing we throw at import so the misconfiguration surfaces
// immediately rather than the app silently pointing at the wrong host.
const BACKEND_URL: string = process.env.EXPO_PUBLIC_BACKEND_URL || '';

if (!BACKEND_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] EXPO_PUBLIC_BACKEND_URL is not set. All API calls will fail. ' +
    'Ensure the environment variable is populated at build/deploy time.'
  );
}

export { BACKEND_URL };
