// src/stores/appStore.ts
// ============================================================
// Global Zustand store — shared across all React islands
// ============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  BootPayload, Slot, SlotDisplay, BookingStep,
  BookingFormData, BirthDetailsData, SiteConfig, Service,
} from '../lib/types';
import type { ConfirmResult } from '../lib/types';
import { bootCache, slotsCache, scheduleUtcMidnightReset } from '../lib/cache';
import { fetchBoot, fetchSlots } from '../lib/api';
import { detectTimezone, transformSlots, groupSlotsByDay } from '../lib/slots';
import type { SlotsByDay } from '../lib/slots';

// ── Store Shape ───────────────────────────────────────────
interface AppState {
  // Boot data
  boot:        BootPayload | null;
  bootStatus:  'idle' | 'loading' | 'ready' | 'error';
  bootError:   string | null;

  // User timezone
  userTimezone: string;

  // Slots
  slots:         SlotDisplay[];
  slotsByDay:    SlotsByDay;
  slotsStatus:   'idle' | 'loading' | 'ready' | 'error';
  slotsError:    string | null;
  activeServiceId: string | null;

  // Booking modal state
  bookingOpen:  boolean;
  bookingStep:  BookingStep;
  selectedSlot: SlotDisplay | null;
  selectedService: Service | null;
  bookingForm:  BookingFormData | null;
  otpToken:     string | null;
  lockToken:    string | null;
  bookingId:    string | null;
  confirmResult: ConfirmResult | null;

  // Actions
  loadBoot: () => Promise<void>;
  reloadBoot: () => Promise<void>;
  loadSlots: (serviceId: string) => Promise<void>;
  openBooking: (slot: SlotDisplay, service: Service) => void;
  closeBooking: () => void;
  setBookingStep: (step: BookingStep) => void;
  setBookingForm: (form: BookingFormData) => void;
  setOtpToken: (token: string) => void;
  setLockToken: (token: string) => void;
  setBookingId: (id: string) => void;
  setConfirmResult: (result: ConfirmResult) => void;
  setUserTimezone: (tz: string) => void;
}

// ── Store Implementation ──────────────────────────────────
export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial State ──
    boot:         null,
    bootStatus:   'idle',
    bootError:    null,
    userTimezone: detectTimezone(),
    slots:        [],
    slotsByDay:   new Map(),
    slotsStatus:  'idle',
    slotsError:   null,
    activeServiceId: null,
    bookingOpen:  false,
    bookingStep:  'form',
    selectedSlot: null,
    selectedService: null,
    bookingForm:  null,
    otpToken:     null,
    lockToken:    null,
    bookingId:    null,
    confirmResult: null,

    // ── Boot Loader ──
    loadBoot: async () => {
      // Check cache first (respects 24h UTC reset)
      const cached = bootCache.get();
      if (cached) {
        set({ boot: cached, bootStatus: 'ready', bootError: null });
        // Schedule midnight cache refresh
        scheduleUtcMidnightReset(() => get().reloadBoot());
        return;
      }

      set({ bootStatus: 'loading', bootError: null });
      const result = await fetchBoot();

      if (!result.ok) {
        set({ bootStatus: 'error', bootError: result.error });
        return;
      }

      bootCache.set(result.data);
      set({ boot: result.data, bootStatus: 'ready', bootError: null });
      scheduleUtcMidnightReset(() => get().reloadBoot());
    },

    // Force reload bypassing cache
    reloadBoot: async () => {
      bootCache.invalidate();
      await get().loadBoot();
    },

    // ── Slots Loader ──
    loadSlots: async (serviceId: string) => {
      const { userTimezone } = get();
      const today = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone });

      // Check 15-min slot cache
      const cached = slotsCache.get(serviceId, today);
      if (cached) {
        const displaySlots = transformSlots(cached, userTimezone);
        const byDay        = groupSlotsByDay(displaySlots);
        set({ slots: displaySlots, slotsByDay: byDay, slotsStatus: 'ready', activeServiceId: serviceId });
        return;
      }

      set({ slotsStatus: 'loading', slotsError: null });
      const result = await fetchSlots(serviceId, today, 14);

      if (!result.ok) {
        set({ slotsStatus: 'error', slotsError: result.error });
        return;
      }

      slotsCache.set(serviceId, today, result.data);
      const displaySlots = transformSlots(result.data, userTimezone);
      const byDay        = groupSlotsByDay(displaySlots);
      set({
        slots:        displaySlots,
        slotsByDay:   byDay,
        slotsStatus:  'ready',
        slotsError:   null,
        activeServiceId: serviceId,
      });
    },

    // ── Booking Actions ──
    openBooking: (slot, service) => set({
      bookingOpen:      true,
      bookingStep:      'form',
      selectedSlot:     slot,
      selectedService:  service,
      bookingForm:      null,
      otpToken:         null,
      lockToken:        null,
      bookingId:        null,
      confirmResult:    null,
    }),

    closeBooking: () => set({
      bookingOpen:  false,
      bookingStep:  'form',
      selectedSlot: null,
      selectedService: null,
    }),

    setBookingStep:    (step)    => set({ bookingStep: step }),
    setBookingForm:    (form)    => set({ bookingForm: form }),
    setOtpToken:       (token)   => set({ otpToken: token }),
    setLockToken:      (token)   => set({ lockToken: token }),
    setBookingId:      (id)      => set({ bookingId: id }),
    setConfirmResult:  (result)  => set({ confirmResult: result }),
    setUserTimezone:   (tz)      => {
      set({ userTimezone: tz });
      // Re-transform slots with new timezone
      const { slots, activeServiceId } = get();
      if (slots.length > 0 && activeServiceId) {
        get().loadSlots(activeServiceId);
      }
    },
  }))
);

// ── Convenience Selectors ──────────────────────────────────
export const selectBoot     = (s: AppState) => s.boot;
export const selectConfig   = (s: AppState) => s.boot?.config ?? null;
export const selectServices = (s: AppState) => s.boot?.services ?? [];
export const selectPricing  = (s: AppState) => s.boot?.pricing ?? [];
export const selectContent  = (s: AppState) => s.boot?.content ?? null;
export const selectFaqs     = (s: AppState) => s.boot?.faqs ?? [];
export const selectTestimonials = (s: AppState) => s.boot?.testimonials ?? [];
