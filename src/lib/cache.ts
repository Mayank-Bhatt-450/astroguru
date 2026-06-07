// src/lib/cache.ts
// ============================================================
// Client-side cache service
// - Boot data: 24h, resets at 00:00 UTC daily
// - Slot data: 15 minutes max
// ============================================================

import type { BootPayload, Slot } from './types';

const BOOT_KEY      = 'jy_boot_v2';       // bump version to force cache bust
const SLOTS_KEY     = 'jy_slots';
const BOOT_TTL_MS   = 24 * 60 * 60 * 1000;  // 24 hours
const SLOTS_TTL_MS  = 15 * 60 * 1000;        // 15 minutes

interface CacheEntry<T> {
  data: T;
  cachedAt: number;       // Date.now() ms
  schemaVersion?: number; // payload.v — used to invalidate on schema bump
}

// ── UTC Day Boundary ──────────────────────────────────────
/**
 * Returns true if the cache was stored before the most recent 00:00 UTC.
 */
function isBeforeUtcMidnight(cachedAt: number): boolean {
  const nowUtc   = Date.now();
  const midnight = getMostRecentUtcMidnight();
  return cachedAt < midnight && nowUtc >= midnight;
}

function getMostRecentUtcMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); // today 00:00:00 UTC
}

// ── Generic helpers ───────────────────────────────────────
function read<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T, extra?: { schemaVersion?: number }): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      cachedAt: Date.now(),
      ...extra,
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    // localStorage may be unavailable in SSR/private browsing — silently ignore
    console.warn('[Cache] write failed:', e);
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* noop */ }
}

// ── Boot Cache ────────────────────────────────────────────
export const bootCache = {
  get(): BootPayload | null {
    const entry = read<BootPayload>(BOOT_KEY);
    if (!entry) return null;

    // Invalidate if we crossed a UTC midnight since the cache was written
    if (isBeforeUtcMidnight(entry.cachedAt)) {
      remove(BOOT_KEY);
      return null;
    }

    // Invalidate if the data is over 24h old (belt-and-suspenders)
    if (Date.now() - entry.cachedAt > BOOT_TTL_MS) {
      remove(BOOT_KEY);
      return null;
    }

    return entry.data;
  },

  set(data: BootPayload): void {
    write<BootPayload>(BOOT_KEY, data, { schemaVersion: data.v });
  },

  invalidate(): void {
    remove(BOOT_KEY);
  },

  /**
   * Check if cache was stored before today's UTC midnight.
   * Exposed for diagnostics.
   */
  isStale(): boolean {
    const entry = read<BootPayload>(BOOT_KEY);
    if (!entry) return true;
    return isBeforeUtcMidnight(entry.cachedAt) || Date.now() - entry.cachedAt > BOOT_TTL_MS;
  },
};

// ── Slots Cache (per service + date key) ──────────────────
export const slotsCache = {
  _key(serviceId: string, from: string): string {
    return `${SLOTS_KEY}_${serviceId}_${from}`;
  },

  get(serviceId: string, from: string): Slot[] | null {
    const key   = this._key(serviceId, from);
    const entry = read<Slot[]>(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > SLOTS_TTL_MS) {
      remove(key);
      return null;
    }
    return entry.data;
  },

  set(serviceId: string, from: string, data: Slot[]): void {
    write<Slot[]>(this._key(serviceId, from), data);
  },

  invalidate(serviceId: string, from: string): void {
    remove(this._key(serviceId, from));
  },

  /**
   * Invalidate ALL slot caches — called after booking confirmation.
   */
  invalidateAll(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(SLOTS_KEY)) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* noop */ }
  },
};

// ── Upcoming Midnight Countdown ───────────────────────────
/**
 * Returns milliseconds until next 00:00 UTC.
 * Use to schedule a forced cache refresh at midnight.
 */
export function msUntilNextUtcMidnight(): number {
  const now  = Date.now();
  const next = getMostRecentUtcMidnight() + BOOT_TTL_MS;
  return Math.max(0, next - now);
}

/**
 * Schedule an automatic boot cache invalidation at the next UTC midnight.
 * Call this once on app mount.
 */
export function scheduleUtcMidnightReset(onReset: () => void): () => void {
  const ms = msUntilNextUtcMidnight();
  const timeoutId = setTimeout(() => {
    bootCache.invalidate();
    onReset();
  }, ms);

  // Return cleanup function
  return () => clearTimeout(timeoutId);
}
