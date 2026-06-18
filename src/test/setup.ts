// src/test/setup.ts
// Global test setup for vitest + @testing-library/react

import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ── Mock import.meta.env ──────────────────────────────────
// Astro/Vite env vars aren't available in vitest without config
vi.stubGlobal('import.meta', {
  env: {
    DEV: false,
    PROD: true,
    PUBLIC_GAS_URL: 'https://script.google.com/test',
    PUBLIC_SKIP_PAYMENT: 'false',
  },
});

// ── Mock localStorage ─────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    (key: string) => store[key] ?? null,
    setItem:    (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear:      () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key:        (idx: number) => Object.keys(store)[idx] ?? null,
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ── Suppress noisy console output in tests ────────────────
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorageMock.clear();
});
