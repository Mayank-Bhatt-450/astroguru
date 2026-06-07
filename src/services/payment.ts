// src/services/payment.ts
// ============================================================
// Razorpay integration — loads SDK, opens checkout, verifies
// ============================================================

import { createRazorpayOrder, confirmBooking, releaseSlot } from '../lib/api';
import { slotsCache } from '../lib/cache';
import type { ConfirmResult } from '../lib/types';

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
export type PaymentResult =
  | { status: 'success'; confirm: ConfirmResult }
  | { status: 'failed';  error: string }
  | { status: 'dismissed' };

// ── Main Payment Flow ─────────────────────────────────────
export async function initiatePayment(params: {
  serviceId:   string;
  amount:      number;          // in paise
  currency:    string;
  bookingId:   string;
  slotId:      string;
  lockToken:   string;
  name:        string;
  email:       string;
  phone:       string;
  description: string;
  siteName:    string;
}): Promise<PaymentResult> {
  const {
    serviceId, amount, currency, bookingId, slotId, lockToken,
    name, email, phone, description, siteName,
  } = params;

  // 1. Load SDK
  try {
    await loadRazorpaySdk();
  } catch {
    return { status: 'failed', error: 'Payment gateway failed to load. Please check your connection.' };
  }

  // 2. Create Razorpay order on the backend
  const orderResult = await createRazorpayOrder({
    amount,
    currency,
    receipt: bookingId,
    serviceId,
    email,
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
      notes:       { bookingId, slotId },
      theme:       { color: '#f9a825' }, // gold
      handler: async (response) => {
        // 4. Payment succeeded — confirm on backend
        const confirmResult = await confirmBooking({
          bookingId,
          slotId,
          lockToken,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpayOrderId:   response.razorpay_order_id,
          razorpaySignature: response.razorpay_signature,
          name,
          email,
          phone,
          serviceId,
        });

        if (!confirmResult.ok) {
          resolve({ status: 'failed', error: confirmResult.error });
          return;
        }

        // Bust slot cache after confirmed booking
        slotsCache.invalidateAll();
        resolve({ status: 'success', confirm: confirmResult.data });
      },
      modal: {
        confirm_close: true,
        ondismiss: async () => {
          // 5. User dismissed — release the lock
          await releaseSlot(slotId, lockToken);
          slotsCache.invalidateAll();
          resolve({ status: 'dismissed' });
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  });
}
