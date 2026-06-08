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
  boot:       BootPayload | null;
  bootStatus: 'idle' | 'loading' | 'ready' | 'error';
  bootError:  string | null;

  // User timezone
  userTimezone: string;

  // Slots
  slots:           SlotDisplay[];
  slotsByDay:      SlotsByDay;
  slotsStatus:     'idle' | 'loading' | 'ready' | 'error';
  slotsError:      string | null;
  activeServiceId: string | null;

  // ── SERVICE-PICKER MODAL ─────────────────────────────────
  // Opened when any "Book Now" button is clicked.
  // The user picks a slot here, which then opens the booking modal.
  servicePickerOpen:      boolean;
  servicePickerServiceId: string | null;   // pre-selected service

  // ── BOOKING MODAL ────────────────────────────────────────
  bookingOpen:     boolean;
  bookingStep:     BookingStep;
  selectedSlot:    SlotDisplay | null;
  selectedService: Service | null;
  bookingForm:     BookingFormData | null;
  otpToken:        string | null;
  lockToken:       string | null;
  bookingId:       string | null;
  confirmResult:   ConfirmResult | null;

  // Actions — boot
  loadBoot:   () => Promise<void>;
  reloadBoot: () => Promise<void>;

  // Actions — slots
  loadSlots: (serviceId: string) => Promise<void>;

  // Actions — service picker modal
  openServicePicker:  (serviceId?: string) => void;
  closeServicePicker: () => void;

  // Actions — booking modal
  // Called from the slot picker when a time chip is clicked
  openBooking:      (slot: SlotDisplay, service: Service) => void;
  closeBooking:     () => void;
  setBookingStep:   (step: BookingStep) => void;
  setBookingForm:   (form: BookingFormData) => void;
  setOtpToken:      (token: string) => void;
  setLockToken:     (token: string) => void;
  setBookingId:     (id: string) => void;
  setConfirmResult: (result: ConfirmResult) => void;
  setUserTimezone:  (tz: string) => void;
}

// ── Store Implementation ──────────────────────────────────
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

    bookingOpen:     false,
    bookingStep:     'form',
    selectedSlot:    null,
    selectedService: null,
    bookingForm:     null,
    otpToken:        null,
    lockToken:       null,
    bookingId:       null,
    confirmResult:   null,

    // ── Boot ─────────────────────────────────────────────
    loadBoot: async () => {
      const cached = bootCache.get();
      if (cached) {
        set({ boot: cached, bootStatus: 'ready', bootError: null });
        scheduleUtcMidnightReset(() => get().reloadBoot());
        return;
      }
      set({ bootStatus: 'loading', bootError: null });
      const result = await fetchBoot();
      if (!result.ok) { set({ bootStatus: 'error', bootError: result.error }); return; }
      bootCache.set(result.data);
      set({ boot: result.data, bootStatus: 'ready', bootError: null });
      scheduleUtcMidnightReset(() => get().reloadBoot());
    },

    reloadBoot: async () => {
      bootCache.invalidate();
      await get().loadBoot();
    },

    // ── Slots ─────────────────────────────────────────────
    loadSlots: async (serviceId: string) => {
      const { userTimezone } = get();
      const today = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone });

      const cached = slotsCache.get(serviceId, today);
      if (cached) {
        const displaySlots = transformSlots(cached, userTimezone);
        set({ slots: displaySlots, slotsByDay: groupSlotsByDay(displaySlots), slotsStatus: 'ready', activeServiceId: serviceId });
        return;
      }

      set({ slotsStatus: 'loading', slotsError: null });
      const result = await fetchSlots(serviceId, today, 14);
      if (!result.ok) { set({ slotsStatus: 'error', slotsError: result.error }); return; }

      slotsCache.set(serviceId, today, result.data);
      const displaySlots = transformSlots(result.data, userTimezone);
      set({
        slots:           displaySlots,
        slotsByDay:      groupSlotsByDay(displaySlots),
        slotsStatus:     'ready',
        slotsError:      null,
        activeServiceId: serviceId,
      });
    },

    // ── Service-picker modal ──────────────────────────────
    /**
     * Called by every "Book Now" / "Book a Consultation" button.
     * serviceId is optional — when passed, that service tab is
     * pre-selected so the user lands directly on its slots.
     */
    openServicePicker: (serviceId?: string) => {
      const { boot, loadSlots } = get();
      // Determine which service to pre-select
      const targetId = serviceId
        ?? get().activeServiceId
        ?? boot?.services?.find(s => s.isActive)?.id
        ?? null;

      set({
        servicePickerOpen:      true,
        servicePickerServiceId: targetId,
        // Reset slot state so we always get a fresh load for the target service
        slotsStatus:     'idle',
        slotsError:      null,
        slots:           [],
        slotsByDay:      new Map(),
      });

      if (targetId) loadSlots(targetId);
    },

    closeServicePicker: () => set({ servicePickerOpen: false }),

    // ── Booking modal ─────────────────────────────────────
    /**
     * Called from the slot-picker modal when a time chip is clicked.
     * Closes the service picker and opens the booking form.
     */
    openBooking: (slot, service) => set({
      servicePickerOpen: false,      // close the slot picker
      bookingOpen:       true,
      bookingStep:       'form',
      selectedSlot:      slot,
      selectedService:   service,
      bookingForm:       null,
      otpToken:          null,
      lockToken:         null,
      bookingId:         null,
      confirmResult:     null,
    }),

    closeBooking: () => set({
      bookingOpen:     false,
      bookingStep:     'form',
      selectedSlot:    null,
      selectedService: null,
    }),

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

// ── Convenience selectors ─────────────────────────────────
export const selectBoot         = (s: AppState) => s.boot;
export const selectConfig       = (s: AppState) => s.boot?.config ?? null;
export const selectServices     = (s: AppState) => s.boot?.services ?? [];
export const selectPricing      = (s: AppState) => s.boot?.pricing ?? [];
export const selectContent      = (s: AppState) => s.boot?.content ?? null;
export const selectFaqs         = (s: AppState) => s.boot?.faqs ?? [];
export const selectTestimonials = (s: AppState) => s.boot?.testimonials ?? [];
