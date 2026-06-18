// src/lib/types.ts
// ============================================================
// Central type definitions for the entire application
// ============================================================

// ── Boot Payload ─────────────────────────────────────────
export interface BootPayload {
  v: number;                      // schema version — bump to force client cache bust
  config: SiteConfig;
  services: Service[];
  pricing: PricingTier[];
  testimonials: Testimonial[];
  faqs: FAQ[];
  content: PageContent;
}

export interface SiteConfig {
  siteName: string;
  tagline: string;
  adminEmail: string;
  timezone: string;               // IANA, e.g. "Asia/Kolkata"
  currencySymbol: string;
  currencyCode: string;           // "INR"
  whatsapp: WhatsAppConfig;
  urgency: UrgencyConfig;
  calendarMap: Record<string, string>; // serviceId → googleCalendarId
}

export interface WhatsAppConfig {
  enabled: boolean;
  number: string;                 // E.164 format without "+"
  buttonText: string;
  position: 'bottom-right' | 'bottom-left';
  defaultMessage: string;
}

export interface UrgencyConfig {
  enabled: boolean;
  slotsLeftText: string;          // "Only {n} slot(s) left this week"
  responseTimeHours: number;
  promoText: string;
  countdownEndTime: string;       // ISO datetime string UTC
}

// ── Services ─────────────────────────────────────────────
export interface Service {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  durationMinutes: number;
  iconEmoji: string;
  imageUrl?: string;
  isActive: boolean;
  order: number;
}

// ── Pricing ──────────────────────────────────────────────
export interface PricingTier {
  id: string;
  serviceId: string;
  label: string;                  // e.g. "Birth Chart Reading"
  price: number;                  // in smallest currency unit (paise for INR)
  priceDisplay: string;           // "₹1,500" — formatted by backend
  isPopular: boolean;
  features: string[];
  ctaText: string;
}

// ── Content ───────────────────────────────────────────────
export interface PageContent {
  hero: {
    headline: string;
    subheadline: string;
    ctaText: string;
    ctaSubText: string;
  };
  about: {
    title: string;
    body: string;                 // may contain basic markdown
    credentials: string[];
    yearsExperience: number;
    clientsServed: number;
  };
  quickConsult: {
    title: string;
    description: string;
    maxQuestions: number;
    turnaroundHours: number;
    price: number;
    priceDisplay: string;
    exampleQuestions: string[];
  };
}

// ── Testimonials & FAQs ───────────────────────────────────
export interface Testimonial {
  id: string;
  name: string;
  city: string;
  service: string;
  rating: number;                 // 1-5
  body: string;
  avatarInitials: string;
  createdAt: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  order: number;
}

// ── Slots ─────────────────────────────────────────────────
export interface Slot {
  id: string;
  serviceId: string;
  serviceName: string;
  startUtc: string;               // ISO 8601 UTC
  endUtc: string;
  durationMinutes: number;
  status: 'available' | 'locked' | 'booked' | 'disabled';
  lockExpiresAt?: string;         // UTC — null if not locked
}

// Transformed slot for display
export interface SlotDisplay extends Slot {
  startLocal: Date;
  endLocal: Date;
  dayKey: string;                 // "2025-01-15"
  timeLabel: string;              // "10:30 AM"
}

// ── Booking ───────────────────────────────────────────────
export type BookingStep = 'form' | 'otp' | 'payment' | 'success' | 'birth-details';

export interface BookingFormData {
  name: string;
  email: string;
  phone: string;
}

export interface BirthDetailsData {
  dateOfBirth: string;            // "YYYY-MM-DD"
  timeOfBirth: string;            // "HH:MM" (24h) or "unknown"
  cityOfBirth: string;
  additionalNotes?: string;
}

export interface BookingRecord {
  id: string;
  slotId: string;
  serviceId: string;
  name: string;
  email: string;
  phone: string;
  status: 'pending-payment' | 'confirmed' | 'cancelled';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  meetLink?: string;
  birthDetails?: BirthDetailsData;
  createdAt: string;
}

// ── Quick Consult ─────────────────────────────────────────
export interface QuickConsultFormData {
  name: string;
  email: string;
  phone: string;
  questions: [string, string?, string?];
  idempotencyKey?: string;
}

export interface QuickConsultRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  question1: string;
  question2?: string;
  question3?: string;
  answer1?: string;
  answer2?: string;
  answer3?: string;
  status: 'received' | 'answered';
  createdAt: string;
  answeredAt?: string;
}

// ── API Responses ─────────────────────────────────────────
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

// Lock/Unlock responses
export interface LockResult {
  lockToken: string;
  lockExpiresAt: string;
}

export interface ConfirmResult {
  bookingId: string;
  meetLink: string;
  calendarEventId: string;
}

// ── Admin ─────────────────────────────────────────────────
export interface SlotTemplate {
  serviceId: string;
  startDate: string;              // "YYYY-MM-DD"
  endDate: string;
  startTime: string;              // "HH:MM" 24h
  durationMinutes: number;
  weekdays: number[];             // 0=Sun, 1=Mon, ..., 6=Sat
}
