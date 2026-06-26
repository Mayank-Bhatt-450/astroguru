// src/stores/appStore.ts
// ============================================================
// Global Zustand store — updated for AstroGuru + Add-ons
// ============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  BootPayload, Slot, SlotDisplay, BookingStep,
  BookingFormData, BirthDetailsData, SiteConfig, Service,
  ConfirmResult, Addon,
} from '../lib/types';
import { bootCache, slotsCache, scheduleUtcMidnightReset } from '../lib/cache';
import { fetchBoot, fetchSlots, checkSlotAvailability, lockSlot, releaseSlot } from '../lib/api';
import { detectTimezone, transformSlots, groupSlotsByDay } from '../lib/slots';
import type { SlotsByDay } from '../lib/slots';

export type SlotCheckStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'locking' }
  | { phase: 'error'; message: string };

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
  slotCheckStatus:        SlotCheckStatus;

  // Booking modal
  bookingOpen:       boolean;
  bookingStep:       BookingStep;
  selectedSlot:      SlotDisplay | null;
  selectedService:   Service | null;
  bookingForm:       BookingFormData | null;
  otpToken:          string | null;
  lockToken:         string | null;
  lockExpiresAt:     string | null;
  bookingId:         string | null;
  confirmResult:     ConfirmResult | null;
  selectedAddonIds:  string[];          // ← NEW

  // Actions — boot
  loadBoot:   (bustCache?: boolean) => Promise<void>;
  reloadBoot: () => Promise<void>;

  // Actions — slots
  loadSlots: (serviceId: string, bypassCache?: boolean) => Promise<void>;

  // Actions — service picker
  openServicePicker:  (serviceId?: string) => void;
  closeServicePicker: () => void;
  selectSlotAndLock:  (slot: SlotDisplay, service: Service) => Promise<void>;

  // Actions — booking modal
  openBooking:        (slot: SlotDisplay, service: Service, lockToken: string, lockExpiresAt: string, bookingId: string) => void;
  closeBooking:       () => Promise<void>;
  setBookingStep:     (step: BookingStep) => void;
  setBookingForm:     (form: BookingFormData) => void;
  setOtpToken:        (token: string) => void;
  setLockToken:       (token: string) => void;
  setBookingId:       (id: string) => void;
  setConfirmResult:   (result: ConfirmResult) => void;
  setUserTimezone:    (tz: string) => void;
  setSelectedAddons:  (ids: string[]) => void;   // ← NEW
  toggleAddon:        (id: string) => void;       // ← NEW
}

// ── Helpers ──────────────────────────────────────────────
function toConfigBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string')  return v.toLowerCase() === 'true';
  if (typeof v === 'number')  return v === 1;
  return false;
}

function normalizeConfig(config: SiteConfig): SiteConfig {
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

/** Pick default add-on IDs for a service/tier combo */
function getDefaultAddonIds(addons: Addon[], serviceId: string, isPopular: boolean): string[] {
  if (!isPopular) return [];
  return addons
    .filter(a => a.isActive && a.popularDefault &&
      (a.serviceIds.length === 0 || a.serviceIds.includes(serviceId)))
    .map(a => a.id);
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({

    // ── Initial state ───────────────────────────────────
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

    bookingOpen:      false,
    bookingStep:      'form',
    selectedSlot:     null,
    selectedService:  null,
    bookingForm:      null,
    otpToken:         null,
    lockToken:        null,
    lockExpiresAt:    null,
    bookingId:        null,
    confirmResult:    null,
    selectedAddonIds: [],

    // ── Boot ────────────────────────────────────────────
    loadBoot: async (bustCache = false) => {
      const cached = bootCache.get();
      if (cached && !bustCache) {
        const normalizedCached = { ...cached, config: normalizeConfig(cached.config) };
        set({ boot: normalizedCached, bootStatus: 'ready', bootError: null });
        scheduleUtcMidnightReset(() => get().reloadBoot());
        return;
      }
      set({ bootStatus: 'loading', bootError: null });
      const result = await fetchBoot(bustCache);
      if (!result.ok) { set({ bootStatus: 'error', bootError: result.error }); return; }
      const normalizedData = { ...result.data, config: normalizeConfig(result.data.config) };
      bootCache.set(normalizedData);
      set({ boot: normalizedData, bootStatus: 'ready', bootError: null });
      scheduleUtcMidnightReset(() => get().reloadBoot());
    },

    reloadBoot: async () => {
      bootCache.invalidate();
      await get().loadBoot(true);
    },

    // ── Slots ────────────────────────────────────────────
    loadSlots: async (serviceId: string, bypassCache = false) => {
      const { userTimezone } = get();
      const today = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone });

      if (!bypassCache) {
        const cached = slotsCache.get(serviceId, today);
        if (cached) {
          const displaySlots = transformSlots(cached, userTimezone);
          set({ slots: displaySlots, slotsByDay: groupSlotsByDay(displaySlots), slotsStatus: 'ready', activeServiceId: serviceId });
          return;
        }
      }

      set({ slotsStatus: 'loading', slotsError: null });
      const result = await fetchSlots(serviceId, today, 14);
      if (!result.ok) { set({ slotsStatus: 'error', slotsError: result.error }); return; }

      const now = Date.now();
      const fresh = result.data.filter(s => new Date(s.startUtc).getTime() > now);
      slotsCache.set(serviceId, today, fresh);
      const displaySlots = transformSlots(fresh, userTimezone);
      set({ slots: displaySlots, slotsByDay: groupSlotsByDay(displaySlots), slotsStatus: 'ready', slotsError: null, activeServiceId: serviceId });
    },

    // ── Service picker ───────────────────────────────────
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

    closeServicePicker: () => set({ servicePickerOpen: false, slotCheckStatus: { phase: 'idle' } }),

    selectSlotAndLock: async (slot: SlotDisplay, service: Service) => {
      if (slot.status !== 'available') {
        set({ slotCheckStatus: { phase: 'error', message: 'This slot is no longer available. Please choose another time.' } });
        return;
      }

      set({ slotCheckStatus: { phase: 'checking' } });
      const checkResult = await checkSlotAvailability(slot.id);

      if (checkResult.ok) {
        const { status, lockExpiresAt } = checkResult.data;
        if (status === 'booked') {
          get().loadSlots(service.id, true);
          set({ slotCheckStatus: { phase: 'error', message: 'This slot has just been booked. Please choose another time.' } });
          return;
        }
        if (status === 'locked') {
          const expired = lockExpiresAt && new Date(lockExpiresAt).getTime() < Date.now();
          if (!expired) {
            get().loadSlots(service.id, true);
            set({ slotCheckStatus: { phase: 'error', message: 'This slot is temporarily held by another user. Please wait a moment or choose another time.' } });
            return;
          }
        }
        if (status === 'disabled') {
          get().loadSlots(service.id, true);
          set({ slotCheckStatus: { phase: 'error', message: 'This slot is not currently available for booking.' } });
          return;
        }
      }

      set({ slotCheckStatus: { phase: 'locking' } });
      const bookingId = `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const lockResult = await lockSlot(slot.id, bookingId);

      if (!lockResult.ok) {
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

      // Determine default add-ons based on service's "popular" tier
      const { boot } = get();
      const addons = boot?.addons ?? [];
      const popularTier = boot?.pricing.find(p => p.serviceId === service.id && p.isPopular);
      const defaultAddonIds = getDefaultAddonIds(addons, service.id, !!popularTier);

      set({ slotCheckStatus: { phase: 'idle' }, selectedAddonIds: defaultAddonIds });
      get().openBooking(slot, service, lockResult.data.lockToken, lockResult.data.lockExpiresAt, bookingId);
    },

    // ── Booking modal ────────────────────────────────────
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
      bookingId,
      confirmResult:     null,
    }),

    closeBooking: async () => {
      const { selectedSlot, lockToken, bookingStep } = get();
      if (selectedSlot && lockToken && bookingStep !== 'success') {
        await releaseSlot(selectedSlot.id, lockToken);
        slotsCache.invalidateAll();
      }
      set({
        bookingOpen:      false,
        bookingStep:      'form',
        selectedSlot:     null,
        selectedService:  null,
        lockToken:        null,
        lockExpiresAt:    null,
        selectedAddonIds: [],
      });
    },

    setBookingStep:     (step)   => set({ bookingStep: step }),
    setBookingForm:     (form)   => set({ bookingForm: form }),
    setOtpToken:        (token)  => set({ otpToken: token }),
    setLockToken:       (token)  => set({ lockToken: token }),
    setBookingId:       (id)     => set({ bookingId: id }),
    setConfirmResult:   (result) => set({ confirmResult: result }),
    setSelectedAddons:  (ids)    => set({ selectedAddonIds: ids }),
    toggleAddon: (id) => {
      const { selectedAddonIds } = get();
      set({
        selectedAddonIds: selectedAddonIds.includes(id)
          ? selectedAddonIds.filter(x => x !== id)
          : [...selectedAddonIds, id],
      });
    },

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
export const selectAddons       = (s: AppState) => s.boot?.addons ?? [];