// src/lib/api.ts
// ============================================================
// API client for Google Apps Script backend
//
// CORS FIX: GAS Web Apps do NOT emit Access-Control-Allow-Origin
// headers for requests with Content-Type: application/json,
// because that triggers a preflight OPTIONS request which GAS
// never handles → the browser blocks the call before it lands.
//
// The fix: send POST bodies as Content-Type: text/plain.
// GAS receives e.postData.contents regardless of Content-Type,
// so JSON.parse(e.postData.contents) still works perfectly.
// text/plain is a "simple request" — no preflight, no CORS block.
// ============================================================

import type {
  ApiResult, BootPayload, Slot, LockResult, ConfirmResult,
  BookingRecord, BirthDetailsData, QuickConsultFormData, SlotTemplate,
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
    // GET: all params as query string (fine for non-sensitive reads)
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    fetchOptions = { method: 'GET' };
  } else {
    // POST: Content-Type MUST be text/plain to avoid CORS preflight.
    // GAS parses e.postData.contents as text regardless.
    // JSON.parse inside doPost still works perfectly.
    fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...params }),
    };
  }

  try {
    const response = await fetch(url.toString(), {
      ...fetchOptions,
      signal: AbortSignal.timeout(20_000), // 20s — GAS cold starts can be slow
    });

    // GAS always returns 200 even for errors; check the JSON body
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
      return { ok: false, error: 'Request timed out. GAS may be under load — try again.', code: 'TIMEOUT' };
    }
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: msg, code: 'NETWORK_ERROR' };
  }
}

// ── Boot (single batch request, 24h cached) ──────────────
export async function fetchBoot(): Promise<ApiResult<BootPayload>> {
  return gasRequest<BootPayload>('boot'); // GET — no sensitive data
}

// ── Slots (live, max 15min cache) ────────────────────────
export async function fetchSlots(
  serviceId: string,
  fromDate: string,
  days = 14
): Promise<ApiResult<Slot[]>> {
  return gasRequest<Slot[]>('getSlots', { serviceId, fromDate, days }); // GET
}

// ── Booking flow ──────────────────────────────────────────
export async function lockSlot(slotId: string, bookingId: string): Promise<ApiResult<LockResult>> {
  return gasRequest<LockResult>('lockSlot', { slotId, bookingId }, 'POST');
}

export async function releaseSlot(slotId: string, lockToken: string): Promise<ApiResult<{ released: boolean }>> {
  return gasRequest<{ released: boolean }>('releaseSlot', { slotId, lockToken }, 'POST');
}

export async function confirmBooking(params: {
  bookingId: string; slotId: string; lockToken: string;
  razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string;
  name: string; email: string; phone: string; serviceId: string;
}): Promise<ApiResult<ConfirmResult>> {
  return gasRequest<ConfirmResult>('confirmBooking', params, 'POST');
}

export async function submitBirthDetails(bookingId: string, details: BirthDetailsData): Promise<ApiResult<{ saved: boolean }>> {
  return gasRequest<{ saved: boolean }>('saveBirthDetails', { bookingId, ...details }, 'POST');
}

export async function createPendingBooking(params: {
  slotId: string; serviceId: string; name: string; email: string;
  phone: string; lockToken: string; razorpayOrderId: string;
}): Promise<ApiResult<{ bookingId: string }>> {
  return gasRequest<{ bookingId: string }>('createPendingBooking', params, 'POST');
}

// ── OTP ───────────────────────────────────────────────────
export async function requestOtp(email: string): Promise<ApiResult<{ sent: boolean; expiresAt: string }>> {
  return gasRequest<{ sent: boolean; expiresAt: string }>('requestOtp', { email }, 'POST');
}

export async function verifyOtp(email: string, otp: string): Promise<ApiResult<{ verified: boolean; token: string }>> {
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

// ── Admin: bookings ───────────────────────────────────────
// NOTE: Uses POST so adminToken is NOT exposed in URL/server logs
export async function adminFetchBookings(
  adminToken: string,
  filters?: { status?: string; from?: string; to?: string }
): Promise<ApiResult<BookingRecord[]>> {
  return gasRequest<BookingRecord[]>('adminGetBookings', { adminToken, ...filters }, 'POST');
}

// ── Admin: slots ──────────────────────────────────────────
export async function adminCreateSlots(
  adminToken: string,
  template: SlotTemplate
): Promise<ApiResult<{ created: number; slotIds: string[] }>> {
  return gasRequest<{ created: number; slotIds: string[] }>(
    'adminCreateSlots', { adminToken, ...template }, 'POST'
  );
}

export async function adminDeleteSlot(adminToken: string, slotId: string): Promise<ApiResult<{ deleted: boolean }>> {
  return gasRequest<{ deleted: boolean }>('adminDeleteSlot', { adminToken, slotId }, 'POST');
}

export async function adminToggleSlot(adminToken: string, slotId: string, enabled: boolean): Promise<ApiResult<{ updated: boolean }>> {
  return gasRequest<{ updated: boolean }>('adminToggleSlot', { adminToken, slotId, enabled }, 'POST');
}

export async function adminUpdateContent(adminToken: string, sheetName: string, rows: unknown[][]): Promise<ApiResult<{ updated: boolean }>> {
  return gasRequest<{ updated: boolean }>('adminUpdateSheet', { adminToken, sheetName, rows }, 'POST');
}
