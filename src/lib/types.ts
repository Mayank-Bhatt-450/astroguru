// src/lib/types.ts
// ============================================================
// Central type definitions — updated for AstroGuru + Add-ons
// ============================================================

// ── Boot Payload ─────────────────────────────────────────
export interface BootPayload {
  v: number;
  config: SiteConfig;
  services: Service[];
  pricing: PricingTier[];
  testimonials: Testimonial[];
  faqs: FAQ[];
  content: PageContent;
  addons?: Addon[];          // ← NEW
}

export interface SiteConfig {
  siteName: string;
  tagline: string;
  adminEmail: string;
  timezone: string;
  currencySymbol: string;
  currencyCode: string;
  whatsapp: WhatsAppConfig;
  urgency: UrgencyConfig;
  calendarMap: Record<string, string>;
}

export interface WhatsAppConfig {
  enabled: boolean;
  number: string;
  buttonText: string;
  position: 'bottom-right' | 'bottom-left';
  defaultMessage: string;
}

export interface UrgencyConfig {
  enabled: boolean;
  slotsLeftText: string;
  responseTimeHours: number;
  promoText: string;
  countdownEndTime: string;
}

// ── Add-ons ───────────────────────────────────────────────
export interface Addon {
  id: string;
  name: string;
  description: string;
  price: number;                  // in paise
  priceDisplay: string;           // "₹199"
  isActive: boolean;
  /** serviceIds this add-on applies to; empty = all services */
  serviceIds: string[];
  /** add-on ids to auto-select for "Most Popular" tiers */
  popularDefault: boolean;
  order: number;
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
  label: string;
  price: number;
  priceDisplay: string;
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
    body: string;
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
  rating: number;
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
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
  status: 'available' | 'locked' | 'booked' | 'disabled';
  lockExpiresAt?: string;
}

export interface SlotDisplay extends Slot {
  startLocal: Date;
  endLocal: Date;
  dayKey: string;
  timeLabel: string;
}

// ── Booking ───────────────────────────────────────────────
export type BookingStep = 'form' | 'addons' | 'otp' | 'payment' | 'success' | 'birth-details';

export interface BookingFormData {
  name: string;
  email: string;
  phone: string;
}

export interface BirthDetailsData {
  dateOfBirth: string;
  timeOfBirth: string;
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
  startDate: string;
  endDate: string;
  startTime: string;
  durationMinutes: number;
  weekdays: number[];
}