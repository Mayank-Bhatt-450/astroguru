// src/services/payment.ts
// ============================================================
// Razorpay integration — loads SDK, opens checkout, returns the
// raw payment response. Does NOT assume a slot-booking flow —
// callers (BookingModal, QuickConsultForm) decide what to do
// with the payment result (confirmBooking vs submitQuickConsult).
// ============================================================

import { createRazorpayOrder } from '../lib/api';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  notes?: Record<string, string>;
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
  };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id:   string;
  razorpay_signature:  string;
}

interface RazorpayInstance {
  open(): void;
  on(event: string, cb: () => void): void;
}

// ── SDK Loader ────────────────────────────────────────────
let sdkLoaded = false;

export function loadRazorpaySdk(): Promise<void> {
  if (sdkLoaded || typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script   = document.createElement('script');
    script.src     = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async   = true;
    script.onload  = () => { sdkLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
    document.head.appendChild(script);
  });
}

// ── Payment Result ────────────────────────────────────────
// Generic result — the raw Razorpay response is handed back so the
// caller can confirm a booking, submit a quick consult, etc.
export type PaymentResult =
  | { status: 'success'; razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string }
  | { status: 'failed';  error: string }
  | { status: 'dismissed' };

// ── Main Payment Flow ─────────────────────────────────────
// Generic Razorpay checkout launcher. Creates an order server-side
// (price is always resolved/verified on the backend via serviceId),
// opens checkout, and resolves with the raw payment response.
//
// IMPORTANT: this function does NOT call confirmBooking or any
// other "what happens after payment" endpoint. That is the
// responsibility of the caller, since different flows (slot
// booking vs quick consult) need different post-payment actions.
export async function initiatePayment(params: {
  serviceId:   string;          // used by the server to resolve canonical price
  amount:      number;          // in paise — for display only; server re-verifies
  currency:    string;
  receiptId:   string;          // unique receipt/reference id (bookingId or qc id)
  name:        string;
  email:       string;
  phone:       string;
  description: string;
  siteName:    string;
  addonIds?:   string[];        // optional — passed to server for price verification
  notes?:      Record<string, string>;
  onDismiss?:  () => void | Promise<void>;  // optional cleanup hook (e.g. releaseSlot)
}): Promise<PaymentResult> {
  const {
    serviceId, amount, currency, receiptId,
    name, email, phone, description, siteName,
    addonIds = [], notes = {}, onDismiss,
  } = params;

  // 1. Load SDK
  try {
    await loadRazorpaySdk();
  } catch {
    return { status: 'failed', error: 'Payment gateway failed to load. Please check your connection.' };
  }

  // 2. Create Razorpay order on the backend (price resolved server-side)
  const orderResult = await createRazorpayOrder({
    amount,
    currency,
    receipt: receiptId,
    serviceId,
    email,
    addonIds,
  });

  if (!orderResult.ok) {
    return { status: 'failed', error: `Could not create payment order: ${orderResult.error}` };
  }

  const { orderId, keyId } = orderResult.data;

  // 3. Open Razorpay checkout in a Promise wrapper
  return new Promise<PaymentResult>((resolve) => {
    const options: RazorpayOptions = {
      key:         keyId,
      amount,
      currency,
      name:        siteName,
      description,
      order_id:    orderId,
      prefill:     { name, email, contact: phone },
      notes,
      theme:       { color: '#f9a825' }, // gold
      handler: (response) => {
        // Hand the raw payment proof back to the caller —
        // they decide what to confirm/submit.
        resolve({
          status: 'success',
          razorpayPaymentId: response.razorpay_payment_id,
          razorpayOrderId:   response.razorpay_order_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
      modal: {
        confirm_close: true,
        ondismiss: async () => {
          if (onDismiss) await onDismiss();
          resolve({ status: 'dismissed' });
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  });
}