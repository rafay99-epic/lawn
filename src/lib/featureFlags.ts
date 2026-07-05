/**
 * Client-side feature flags (read from Vite env at build time).
 *
 * `paymentsEnabled` mirrors the backend `PAYMENTS_ENABLED` Convex env var. When
 * `VITE_PAYMENTS_ENABLED` is set to "false" the frontend hides every
 * billing/subscription/pricing surface (checkout buttons, paywall cards, the
 * pricing page and marketing pricing sections). Defaults to enabled so the
 * upstream experience is preserved unless explicitly turned off.
 *
 * Keep this in sync with the backend flag: to fully disable payments set BOTH
 * `PAYMENTS_ENABLED=false` (Convex) and `VITE_PAYMENTS_ENABLED=false` (web).
 */
export const paymentsEnabled: boolean =
  import.meta.env.VITE_PAYMENTS_ENABLED !== "false";
