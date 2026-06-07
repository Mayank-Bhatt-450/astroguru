// src/lib/slots.ts
// ============================================================
// Slot utility functions: timezone detection, display transforms,
// grouping by day, formatting times in user's local timezone
// ============================================================

import type { Slot, SlotDisplay } from './types';

// ── Timezone Detection ────────────────────────────────────
let _detectedTimezone: string | null = null;

export function detectTimezone(): string {
  if (_detectedTimezone) return _detectedTimezone;
  try {
    _detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return _detectedTimezone;
  } catch {
    _detectedTimezone = 'UTC';
    return _detectedTimezone;
  }
}

export function formatTimezoneLabel(tz: string): string {
  try {
    const offset = new Date().toLocaleTimeString('en', {
      timeZone: tz,
      timeZoneName: 'short',
    }).split(' ').slice(-1)[0];
    return `${tz.replace(/_/g, ' ')} (${offset})`;
  } catch {
    return tz;
  }
}

// ── Slot Transformations ──────────────────────────────────
export function transformSlot(slot: Slot, userTimezone: string): SlotDisplay {
  const startLocal = new Date(slot.startUtc);
  const endLocal   = new Date(slot.endUtc);

  // dayKey in user's LOCAL calendar date (so "tomorrow" is correct)
  const dayKey = startLocal.toLocaleDateString('en-CA', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }); // "YYYY-MM-DD"

  const timeLabel = startLocal.toLocaleTimeString('en-US', {
    timeZone: userTimezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return { ...slot, startLocal, endLocal, dayKey, timeLabel };
}

export function transformSlots(slots: Slot[], userTimezone: string): SlotDisplay[] {
  return slots.map(s => transformSlot(s, userTimezone));
}

// ── Grouping ──────────────────────────────────────────────
export type SlotsByDay = Map<string, SlotDisplay[]>;

export function groupSlotsByDay(slots: SlotDisplay[]): SlotsByDay {
  const map = new Map<string, SlotDisplay[]>();
  for (const slot of slots) {
    const existing = map.get(slot.dayKey) ?? [];
    existing.push(slot);
    map.set(slot.dayKey, existing);
  }
  // Sort each day's slots by time
  for (const [key, daySlots] of map) {
    map.set(key, daySlots.sort((a, b) => a.startLocal.getTime() - b.startLocal.getTime()));
  }
  return map;
}

// ── Next 7 Days Strip ─────────────────────────────────────
export interface DayStrip {
  dayKey: string;           // "YYYY-MM-DD"
  dayName: string;          // "Mon"
  dayNumber: string;        // "15"
  month: string;            // "Jan"
  slotCount: number;
  availableCount: number;
  hasSlots: boolean;
}

export function buildWeekStrip(
  slotsByDay: SlotsByDay,
  userTimezone: string,
  daysAhead: number = 14
): DayStrip[] {
  const today = new Date();
  const strips: DayStrip[] = [];

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const dayKey = date.toLocaleDateString('en-CA', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const daySlots = slotsByDay.get(dayKey) ?? [];
    const available = daySlots.filter(s => s.status === 'available');

    strips.push({
      dayKey,
      dayName: date.toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'short' }),
      dayNumber: date.toLocaleDateString('en-US', { timeZone: userTimezone, day: 'numeric' }),
      month: date.toLocaleDateString('en-US', { timeZone: userTimezone, month: 'short' }),
      slotCount: daySlots.length,
      availableCount: available.length,
      hasSlots: daySlots.length > 0,
    });
  }

  return strips;
}

// ── Formatting Helpers ────────────────────────────────────
export function formatSlotDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
}

export function formatDateHeader(dayKey: string, userTimezone: string): string {
  const date = new Date(dayKey + 'T12:00:00Z');
  const today    = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: userTimezone });

  if (dayKey === today)    return 'Today';
  if (dayKey === tomorrow) return 'Tomorrow';

  return date.toLocaleDateString('en-US', {
    timeZone: userTimezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ── Availability Label ─────────────────────────────────────
export function getSlotStatusLabel(status: Slot['status']): string {
  switch (status) {
    case 'available': return 'Available';
    case 'booked':    return 'Booked';
    case 'locked':    return 'Hold';
    case 'disabled':  return 'Unavailable';
  }
}
