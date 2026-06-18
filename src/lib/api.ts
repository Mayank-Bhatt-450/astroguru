// src/lib/api.ts
// ============================================================
// API client for Google Apps Script backend.
//
// CORS: all POST bodies sent as Content-Type: text/plain to avoid
// CORS preflight (GAS does not handle OPTIONS). text/plain is a
// CORS "simple request" — no preflight, no block. GAS parses
// e.postData.contents regardless of Content-Type.
// ============================================================

import type {
  ApiResult, BootPayload, Slot, LockResult, ConfirmResult,
  BookingRecord, BirthDetailsData, QuickConsultFormData, SlotTemplate,
  QuickConsultRecord,
} from './types';

const GAS_URL = import.meta.env.PUBLIC_GAS_URL as string;
const IS_DEV  = import.meta.env.DEV;

if (!IS_DEV && (!GAS_URL || GAS_URL.includes('YOUR_DEPLOYMENT_ID'))) {
  console.error('[API] PUBLIC_GAS_URL is not configured.');
}

// ── Base fetcher ──────────────────────────────────────────
async function gasRequest<T>(
  action: string,
  params: Record<string, unknown> = {},
  method: 'GET' | 'POST' = 'GET'
): Promise<ApiResult<T>> {
  const url = new URL(GAS_URL);

  let fetchOptions: RequestInit;

  if (method === 'GET') {
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    fetchOptions = { method: 'GET' };
  } else {
    // text/plain avoids CORS preflight; GAS reads e.postData.contents fine
    fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...params }),
    };
  }

  try {
    const response = await fetch(url.toString(), {
      ...fetchOptions,
      signal: AbortSignal.timeout(20_000),
    });

    const text = await response.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `Invalid JSON from server: ${text.slice(0, 200)}`, code: 'PARSE_ERROR' };
    }

    if (json.ok === false) {
      return { ok: false, error: (json.error as string) || 'Unknown backend error', code: json.code as string };
    }

    return { ok: true, data: json.data as T };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Request timed out — please try again.', code: 'TIMEOUT' };
    }
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: msg, code: 'NETWORK_ERROR' };
  }
}

// ── Boot ─────────────────────────────────────────────────
export async function fetchBoot(bustCache = false): Promise<ApiResult<BootPayload>> {
  const params = bustCache ? { _t: Date.now() } : {};
  return gasRequest<BootPayload>('boot', params);
}

// ── Slots ─────────────────────────────────────────────────
export async function fetchSlots(
  serviceId: string,
  fromDate: string,
  days = 14
): Promise<ApiResult<Slot[]>> {
  return gasRequest<Slot[]>('getSlots', { serviceId, fromDate, days });
}

/**
 * FIX BUG 1 + 2: Live single-slot availability check.
 * Called immediately when a time chip is clicked (before opening the modal).
 * Returns the current server-side status of one slot without locking it.
 * Uses GET (no side effects, safe to cache-bust via timestamp param).
 */
export async function checkSlotAvailability(
  slotId: string
): Promise<ApiResult<{ slotId: string; status: Slot['status']; lockExpiresAt: string | null }>> {
  return gasRequest<{ slotId: string; status: Slot['status']; lockExpiresAt: string | null }>(
    'checkSlot', { slotId, _t: Date.now() } // _t busts any CDN/edge cache
  );
}

// ── Booking flow ──────────────────────────────────────────

/**
 * FIX BUG 3: Lock is now acquired at the very start of the booking flow
 * (before the contact form is shown), not inside the payment step.
 * This prevents users from filling the form + completing OTP only to
 * find the slot was taken when they reach payment.
 */
export async function lockSlot(
  slotId: string,
  bookingId: string
): Promise<ApiResult<LockResult>> {
  return gasRequest<LockResult>('lockSlot', { slotId, bookingId }, 'POST');
}

export async function releaseSlot(
  slotId: string,
  lockToken: string
): Promise<ApiResult<{ released: boolean }>> {
  return gasRequest<{ released: boolean }>('releaseSlot', { slotId, lockToken }, 'POST');
}

export async function confirmBooking(params: {
  bookingId: string; slotId: string; lockToken: string;
  razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string;
  name: string; email: string; phone: string; serviceId: string;
}): Promise<ApiResult<ConfirmResult>> {
  return gasRequest<ConfirmResult>('confirmBooking', params, 'POST');
}

/**
 * Dev-only booking confirmation — called when SKIP_PAYMENT=true.
 * Performs all the same backend work as confirmBooking() (marks slot booked,
 * creates Calendar event, generates Meet link, sends confirmation email,
 * writes Bookings row) but skips the Razorpay signature check.
 * NEVER expose this in production — it is gated by ADMIN_SECRET in GAS.
 */
export async function devConfirmBooking(params: {
  bookingId: string;
  slotId:    string;
  lockToken: string;
  name:      string;
  email:     string;
  phone:     string;
  serviceId: string;
}): Promise<ApiResult<ConfirmResult>> {
  return gasRequest<ConfirmResult>('devConfirmBooking', params, 'POST');
}

export async function submitBirthDetails(
  bookingId: string,
  details: BirthDetailsData
): Promise<ApiResult<{ saved: boolean }>> {
  return gasRequest<{ saved: boolean }>('saveBirthDetails', { bookingId, ...details }, 'POST');
}

export async function createPendingBooking(params: {
  slotId: string; serviceId: string; name: string; email: string;
  phone: string; lockToken: string; razorpayOrderId: string;
}): Promise<ApiResult<{ bookingId: string }>> {
  return gasRequest<{ bookingId: string }>('createPendingBooking', params, 'POST');
}

// ── OTP ───────────────────────────────────────────────────
export async function requestOtp(
  email: string
): Promise<ApiResult<{ sent: boolean; expiresAt: string }>> {
  return gasRequest<{ sent: boolean; expiresAt: string }>('requestOtp', { email }, 'POST');
}

export async function verifyOtp(
  email: string,
  otp: string
): Promise<ApiResult<{ verified: boolean; token: string }>> {
  return gasRequest<{ verified: boolean; token: string }>('verifyOtp', { email, otp }, 'POST');
}

// ── Quick consult ─────────────────────────────────────────
export async function submitQuickConsult(
  data: QuickConsultFormData & { razorpayPaymentId: string; razorpayOrderId: string }
): Promise<ApiResult<{ consultId: string }>> {
  return gasRequest<{ consultId: string }>('quickConsult', data, 'POST');
}

// ── Razorpay ──────────────────────────────────────────────
export async function createRazorpayOrder(params: {
  amount: number; currency: string; receipt: string; serviceId: string; email: string;
}): Promise<ApiResult<{ orderId: string; amount: number; currency: string; keyId: string }>> {
  return gasRequest<{ orderId: string; amount: number; currency: string; keyId: string }>(
    'createRazorpayOrder', params, 'POST'
  );
}

// ── Admin ─────────────────────────────────────────────────
export async function adminFetchBookings(
  adminToken: string,
  filters?: { status?: string; from?: string; to?: string }
): Promise<ApiResult<BookingRecord[]>> {
  return gasRequest<BookingRecord[]>('adminGetBookings', { adminToken, ...filters }, 'POST');
}

export async function adminCreateSlots(
  adminToken: string,
  template: SlotTemplate
): Promise<ApiResult<{ created: number; slotIds: string[] }>> {
  return gasRequest<{ created: number; slotIds: string[] }>(
    'adminCreateSlots', { adminToken, ...template }, 'POST'
  );
}

export async function adminDeleteSlot(
  adminToken: string,
  slotId: string
): Promise<ApiResult<{ deleted: boolean }>> {
  return gasRequest<{ deleted: boolean }>('adminDeleteSlot', { adminToken, slotId }, 'POST');
}

export async function adminToggleSlot(
  adminToken: string,
  slotId: string,
  enabled: boolean
): Promise<ApiResult<{ updated: boolean }>> {
  return gasRequest<{ updated: boolean }>('adminToggleSlot', { adminToken, slotId, enabled }, 'POST');
}

export async function adminUpdateContent(
  adminToken: string,
  sheetName: string,
  rows: unknown[][]
): Promise<ApiResult<{ updated: boolean }>> {
  return gasRequest<{ updated: boolean }>('adminUpdateSheet', { adminToken, sheetName, rows }, 'POST');
}

// ── Admin: cancel & reschedule ────────────────────────────

export interface BookingBySlotResult {
  id:              string;
  name:            string;
  email:           string;
  phone:           string;
  serviceId:       string;
  slotId:          string;
  status:          string;
  meetLink:        string;
  calendarEventId: string;
  createdAt:       string;
}

export async function adminGetBookingBySlot(
  adminToken: string,
  slotId: string
): Promise<ApiResult<BookingBySlotResult | null>> {
  return gasRequest<BookingBySlotResult | null>(
    'adminGetBookingBySlot', { adminToken, slotId }, 'POST'
  );
}

export async function adminCancelBooking(
  adminToken: string,
  bookingId: string,
  reason: string
): Promise<ApiResult<{ cancelled: boolean; bookingId: string }>> {
  return gasRequest<{ cancelled: boolean; bookingId: string }>(
    'adminCancelBooking', { adminToken, bookingId, reason }, 'POST'
  );
}

export async function adminRescheduleBooking(
  adminToken: string,
  bookingId: string,
  newSlotId: string,
  reason: string
): Promise<ApiResult<{
  rescheduled:        boolean;
  bookingId:          string;
  newSlotId:          string;
  newMeetLink:        string;
  newCalendarEventId: string;
}>> {
  return gasRequest<{
    rescheduled:        boolean;
    bookingId:          string;
    newSlotId:          string;
    newMeetLink:        string;
    newCalendarEventId: string;
  }>('adminRescheduleBooking', { adminToken, bookingId, newSlotId, reason }, 'POST');
}

// ── Admin: Quick Consults ──────────────────────────────────
export async function adminFetchQuickConsults(
  adminToken: string
): Promise<ApiResult<QuickConsultRecord[]>> {
  return gasRequest<QuickConsultRecord[]>('adminGetQuickConsults', { adminToken }, 'POST');
}

export async function adminAnswerQuickConsult(
  adminToken: string,
  consultId: string,
  answers: [string, string?, string?]
): Promise<ApiResult<{ answered: boolean }>> {
  return gasRequest<{ answered: boolean }>('adminAnswerQuickConsult', { adminToken, consultId, answers }, 'POST');
}

// ── Admin: Config repair ──────────────────────────────────
/**
 * Repairs boolean cells in the Config sheet.
 * Google Sheets auto-converts string 'true' → boolean TRUE via setValue(),
 * which breaks the getConfig() equality check.
 * Run this once after initial setup or if WhatsApp/Urgency stop appearing.
 */
export async function adminFixConfigBooleans(
  adminToken: string
): Promise<ApiResult<{ fixed: number }>> {
  return gasRequest<{ fixed: number }>(
    'fixConfigBooleans', { adminToken }, 'POST'
  );
}
