// src/lib/flags.ts
// ============================================================
// Environment feature flags
// All PUBLIC_ prefixed flags are safe to read in the browser.
// ============================================================

/**
 * SKIP_PAYMENT — development/testing bypass.
 *
 * When true:
 *   - The payment step is replaced with a "Dev Mode" confirmation screen.
 *   - lockSlot() is still called so the concurrency path is tested.
 *   - confirmBooking() is NOT called (no Razorpay, no GAS charge).
 *   - A fake ConfirmResult is synthesised so the success/birth-details
 *     step still renders correctly.
 *
 * Set PUBLIC_SKIP_PAYMENT=true in your .env file.
 * NEVER deploy with this true — it bypasses real payment collection.
 */
export const SKIP_PAYMENT: boolean =
  import.meta.env.PUBLIC_SKIP_PAYMENT === 'true';

/**
 * IS_DEV — true when running `astro dev`.
 * Used for mock-data guards elsewhere in the codebase.
 */
export const IS_DEV: boolean = import.meta.env.DEV === true;
