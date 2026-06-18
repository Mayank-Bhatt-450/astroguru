// src/stores/appStore.ts
// ============================================================
// Global Zustand store.
//
// BOOKING FLOW (fixed):
//
//   1. User clicks a time chip in ServicePickerModal
//   2. checkSlotAvailability() → live server check (no lock yet)
//      If not 'available': show inline error, do not open modal
//   3. lockSlot() → atomically reserve the slot on the server
//      If lock fails: show error, do not open modal
//   4. BookingModal opens in 'form' step WITH the lock already held.
//      lockToken and lockExpiresAt are stored in state.
//      A countdown timer shows time remaining on the lock.
//   5. form → otp steps proceed normally
//   6. Before advancing form→otp: re-validate slot is still 'locked'
//      and the lockToken matches (catches expiry during form fill)
//   7. payment step: slot is already locked — payment runs immediately
//   8. On confirm: server verifies lockToken ownership before writing
//   9. On close/cancel at any step: releaseSlot() frees the lock
// ============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  BootPayload, Slot, SlotDisplay, BookingStep,
  BookingFormData, BirthDetailsData, SiteConfig, Service,
  ConfirmResult,
} from '../lib/types';
import { bootCache, slotsCache, scheduleUtcMidnightReset } from '../lib/cache';
import { fetchBoot, fetchSlots, checkSlotAvailability, lockSlot, releaseSlot } from '../lib/api';
import { detectTimezone, transformSlots, groupSlotsByDay } from '../lib/slots';
import type { SlotsByDay } from '../lib/slots';

// ── Types ─────────────────────────────────────────────────
export type SlotCheckStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'locking' }
  | { phase: 'error'; message: string }; // shown inside the picker

// ── Store Shape ───────────────────────────────────────────
interface AppState {
  // Boot
  boot:       BootPayload | null;
  bootStatus: 'idle' | 'loading' | 'ready' | 'error';
  bootError:  string | null;

  userTimezone: string;

  // Slots
  slots:           SlotDisplay[];
  slotsByDay:      SlotsByDay;
  slotsStatus:     'idle' | 'loading' | 'ready' | 'error';
  slotsError:      string | null;
  activeServiceId: string | null;

  // Service picker modal
  servicePickerOpen:      boolean;
  servicePickerServiceId: string | null;
  slotCheckStatus:        SlotCheckStatus; // feedback while checking+locking

  // Booking modal
  bookingOpen:     boolean;
  bookingStep:     BookingStep;
  selectedSlot:    SlotDisplay | null;
  selectedService: Service | null;
  bookingForm:     BookingFormData | null;
  otpToken:        string | null;
  lockToken:       string | null;
  lockExpiresAt:   string | null;  // ISO UTC — drives the countdown timer
  bookingId:       string | null;
  confirmResult:   ConfirmResult | null;

  // Actions — boot
  loadBoot:   (bustCache?: boolean) => Promise<void>;
  reloadBoot: () => Promise<void>;

  // Actions — slots
  loadSlots: (serviceId: string, bypassCache?: boolean) => Promise<void>;

  // Actions — service picker
  openServicePicker:   (serviceId?: string) => void;
  closeServicePicker:  () => void;
  /**
   * Called when a time chip is clicked.
   * 1. Live-checks slot availability on server (fixes Bug 1+2)
   * 2. Atomically locks the slot (fixes Bug 3 — lock before form)
   * 3. Opens BookingModal only if both succeed
   */
  selectSlotAndLock:   (slot: SlotDisplay, service: Service) => Promise<void>;

  // Actions — booking modal
  openBooking:         (slot: SlotDisplay, service: Service, lockToken: string, lockExpiresAt: string, bookingId: string) => void;
  closeBooking:        () => Promise<void>;
  setBookingStep:      (step: BookingStep) => void;
  setBookingForm:      (form: BookingFormData) => void;
  setOtpToken:         (token: string) => void;
  setLockToken:        (token: string) => void;
  setBookingId:        (id: string) => void;
  setConfirmResult:    (result: ConfirmResult) => void;
  setUserTimezone:     (tz: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────
// Tolerant boolean coercion — mirrors GAS cfgBool().
// Handles all forms that Google Sheets / stale cache might produce:
//   boolean true | string 'true' | string 'TRUE' | string 'True' | number 1
function toConfigBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string')  return v.toLowerCase() === 'true';
  if (typeof v === 'number')  return v === 1;
  return false;
}

function normalizeConfig(config: SiteConfig): SiteConfig {
  if (import.meta.env.DEV) {
    console.log('[normalizeConfig] raw enabled values:', {
      waEnabled:      (config.whatsapp as unknown as Record<string,unknown>).enabled,
      urgencyEnabled: (config.urgency  as unknown as Record<string,unknown>).enabled,
    });
  }
  return {
    ...config,
    whatsapp: {
      ...config.whatsapp,
      enabled: toConfigBool((config.whatsapp as unknown as Record<string,unknown>).enabled),
    },
    urgency: {
      ...config.urgency,
      enabled: toConfigBool((config.urgency as unknown as Record<string,unknown>).enabled),
    },
  };
}

// ── Store ─────────────────────────────────────────────────
export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({

    // ── Initial state ─────────────────────────────────────
    boot:       null,
    bootStatus: 'idle',
    bootError:  null,

    userTimezone: detectTimezone(),

    slots:           [],
    slotsByDay:      new Map(),
    slotsStatus:     'idle',
    slotsError:      null,
    activeServiceId: null,

    servicePickerOpen:      false,
    servicePickerServiceId: null,
    slotCheckStatus:        { phase: 'idle' },

    bookingOpen:     false,
    bookingStep:     'form',
    selectedSlot:    null,
    selectedService: null,
    bookingForm:     null,
    otpToken:        null,
    lockToken:       null,
    lockExpiresAt:   null,
    bookingId:       null,
    confirmResult:   null,

    // ── Boot ─────────────────────────────────────────────
    loadBoot: async (bustCache = false) => {
      const cached = bootCache.get();
      if (cached && !bustCache) {
        if (import.meta.env.DEV) console.log('[AppStore] Using cached boot data');
        const normalizedCached = { ...cached, config: normalizeConfig(cached.config) };
        set({ boot: normalizedCached, bootStatus: 'ready', bootError: null });
        scheduleUtcMidnightReset(() => get().reloadBoot());
        return;
      }
      if (import.meta.env.DEV) console.log('[AppStore] Fetching fresh boot data from server', { bustCache });
      set({ bootStatus: 'loading', bootError: null });
      const result = await fetchBoot(bustCache);
      if (!result.ok) { 
        if (import.meta.env.DEV) console.error('[AppStore] Boot fetch failed:', result.error);
        set({ bootStatus: 'error', bootError: result.error }); 
        return; 
      }
      if (import.meta.env.DEV) console.log('[AppStore] Boot data received:', { 
        config: result.data.config,
        whatsapp: result.data.config?.whatsapp,
        urgency: result.data.config?.urgency
      });
      const normalizedData = { ...result.data, config: normalizeConfig(result.data.config) };
      bootCache.set(normalizedData);
      set({ boot: normalizedData, bootStatus: 'ready', bootError: null });
      scheduleUtcMidnightReset(() => get().reloadBoot());
      
      // Verify the config is accessible via selectors after state update
      if (import.meta.env.DEV) {
        const newState = get();
        console.log('[AppStore] Post-loadBoot state verification:', {
          bootStatus: newState.bootStatus,
          configPresent: !!newState.boot?.config,
          whatsapp: newState.boot?.config?.whatsapp,
          urgency: newState.boot?.config?.urgency
        });
      }
    },

    reloadBoot: async () => {
      if (import.meta.env.DEV) console.log('[AppStore] reloadBoot called - invalidating cache and refetching');
      bootCache.invalidate();
      await get().loadBoot(true); // force bypass cache
      
      // Verify the config was loaded correctly
      const newBoot = get().boot;
      if (import.meta.env.DEV && newBoot) {
        console.log('[AppStore] reloadBoot verification - config loaded:', {
          whatsapp: newBoot.config?.whatsapp,
          urgency: newBoot.config?.urgency
        });
      }
    },

    // ── Slots ─────────────────────────────────────────────
    loadSlots: async (serviceId: string, bypassCache = false) => {
      const { userTimezone } = get();
      const today = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone });

      if (!bypassCache) {
        const cached = slotsCache.get(serviceId, today);
        if (cached) {
          const displaySlots = transformSlots(cached, userTimezone);
          set({
            slots:           displaySlots,
            slotsByDay:      groupSlotsByDay(displaySlots),
            slotsStatus:     'ready',
            activeServiceId: serviceId,
          });
          return;
        }
      }

      set({ slotsStatus: 'loading', slotsError: null });
      const result = await fetchSlots(serviceId, today, 14);
      if (!result.ok) { set({ slotsStatus: 'error', slotsError: result.error }); return; }

      // FIX BUG 6: filter out past slots (slots that started before now)
      const now = Date.now();
      const fresh = result.data.filter(s => new Date(s.startUtc).getTime() > now);

      slotsCache.set(serviceId, today, fresh);
      const displaySlots = transformSlots(fresh, userTimezone);
      set({
        slots:           displaySlots,
        slotsByDay:      groupSlotsByDay(displaySlots),
        slotsStatus:     'ready',
        slotsError:      null,
        activeServiceId: serviceId,
      });
    },

    // ── Service picker ────────────────────────────────────
    openServicePicker: (serviceId?: string) => {
      const { boot, loadSlots } = get();
      const targetId = serviceId
        ?? get().activeServiceId
        ?? boot?.services?.find(s => s.isActive)?.id
        ?? null;

      set({
        servicePickerOpen:      true,
        servicePickerServiceId: targetId,
        slotCheckStatus:        { phase: 'idle' },
        slotsStatus:            'idle',
        slotsError:             null,
        slots:                  [],
        slotsByDay:             new Map(),
      });

      if (targetId) loadSlots(targetId);
    },

    closeServicePicker: () => set({
      servicePickerOpen: false,
      slotCheckStatus:   { phase: 'idle' },
    }),

    // ── FIX BUG 1+2+3: Atomic check-then-lock on chip click ─
    selectSlotAndLock: async (slot: SlotDisplay, service: Service) => {
      // Guard: only act on locally-available slots (first filter)
      if (slot.status !== 'available') {
        set({ slotCheckStatus: { phase: 'error', message: 'This slot is no longer available. Please choose another time.' } });
        return;
      }

      // Step 1 — Live availability check (bust any CDN/client cache)
      set({ slotCheckStatus: { phase: 'checking' } });
      const checkResult = await checkSlotAvailability(slot.id);

      if (!checkResult.ok) {
        // Network error — still attempt the lock; lockSlot will reject if unavailable
        console.warn('[selectSlotAndLock] checkSlot failed, proceeding to lock:', checkResult.error);
      } else {
        const { status, lockExpiresAt } = checkResult.data;

        if (status === 'booked') {
          // Refresh slot list so the UI reflects reality
          get().loadSlots(service.id, true);
          set({ slotCheckStatus: { phase: 'error', message: 'This slot has just been booked by someone else. Please choose another time.' } });
          return;
        }

        if (status === 'locked') {
          // Check if the lock has already expired server-side
          const expired = lockExpiresAt && new Date(lockExpiresAt).getTime() < Date.now();
          if (!expired) {
            get().loadSlots(service.id, true);
            set({ slotCheckStatus: { phase: 'error', message: 'This slot is temporarily held by another user. Please wait a moment or choose another time.' } });
            return;
          }
          // Expired lock — proceed; lockSlot will clean it up
        }

        if (status === 'disabled') {
          get().loadSlots(service.id, true);
          set({ slotCheckStatus: { phase: 'error', message: 'This slot is not currently available for booking.' } });
          return;
        }
      }

      // Step 2 — Atomically lock the slot before showing the form
      set({ slotCheckStatus: { phase: 'locking' } });
      const bookingId = `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const lockResult = await lockSlot(slot.id, bookingId);

      if (!lockResult.ok) {
        // Lock failed — slot was grabbed by a concurrent user
        get().loadSlots(service.id, true);
        set({
          slotCheckStatus: {
            phase: 'error',
            message: lockResult.error?.includes('no longer available')
              ? 'This slot was just taken. Please choose another time.'
              : `Could not reserve slot: ${lockResult.error}`,
          },
        });
        return;
      }

      // Step 3 — Lock acquired. Open BookingModal with the lock token.
      set({ slotCheckStatus: { phase: 'idle' } });
      get().openBooking(slot, service, lockResult.data.lockToken, lockResult.data.lockExpiresAt, bookingId);
    },

    // ── Booking modal ─────────────────────────────────────
    openBooking: (slot, service, lockToken, lockExpiresAt, bookingId) => set({
      servicePickerOpen: false,
      bookingOpen:       true,
      bookingStep:       'form',
      selectedSlot:      slot,
      selectedService:   service,
      bookingForm:       null,
      otpToken:          null,
      lockToken,
      lockExpiresAt,
      bookingId,          // the ID used in lockSlot — consistent throughout the flow
      confirmResult:     null,
    }),

    closeBooking: async () => {
      const { selectedSlot, lockToken, bookingStep } = get();
      // Release the server-side lock unless booking is already confirmed
      if (selectedSlot && lockToken && bookingStep !== 'success') {
        await releaseSlot(selectedSlot.id, lockToken);
        slotsCache.invalidateAll();
      }
      set({
        bookingOpen:     false,
        bookingStep:     'form',
        selectedSlot:    null,
        selectedService: null,
        lockToken:       null,
        lockExpiresAt:   null,
      });
    },

    setBookingStep:   (step)   => set({ bookingStep: step }),
    setBookingForm:   (form)   => set({ bookingForm: form }),
    setOtpToken:      (token)  => set({ otpToken: token }),
    setLockToken:     (token)  => set({ lockToken: token }),
    setBookingId:     (id)     => set({ bookingId: id }),
    setConfirmResult: (result) => set({ confirmResult: result }),

    setUserTimezone: (tz) => {
      set({ userTimezone: tz });
      const { activeServiceId } = get();
      if (activeServiceId) get().loadSlots(activeServiceId);
    },
  }))
);

// ── Selectors ─────────────────────────────────────────────
export const selectBoot         = (s: AppState) => s.boot;
export const selectConfig       = (s: AppState) => (s.boot?.config ? normalizeConfig(s.boot.config) : null);
export const selectServices     = (s: AppState) => s.boot?.services ?? [];
export const selectPricing      = (s: AppState) => s.boot?.pricing ?? [];
export const selectContent      = (s: AppState) => s.boot?.content ?? null;
export const selectFaqs         = (s: AppState) => s.boot?.faqs ?? [];
export const selectTestimonials = (s: AppState) => s.boot?.testimonials ?? [];
