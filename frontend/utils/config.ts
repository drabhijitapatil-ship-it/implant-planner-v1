// EXPO_PUBLIC_* vars are inlined by Metro at build time.
// EAS builds set this via eas.json env block.
const BACKEND_URL: string = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export { BACKEND_URL };
