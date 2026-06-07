// src/services/otp.ts
// ============================================================
// OTP flow service — wrapper around the API with local state management
// ============================================================

import { requestOtp, verifyOtp } from '../lib/api';

export type OtpState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'sent'; email: string; expiresAt: Date; resendAt: Date }
  | { phase: 'verifying' }
  | { phase: 'verified'; email: string; token: string }
  | { phase: 'error'; message: string };

const RESEND_COOLDOWN_SEC = 60; // 60 seconds before user can resend

export class OtpService {
  private state: OtpState = { phase: 'idle' };
  private listeners: Set<(state: OtpState) => void> = new Set();

  subscribe(listener: (state: OtpState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(next: OtpState) {
    this.state = next;
    this.listeners.forEach(l => l(next));
  }

  getState() { return this.state; }

  async sendOtp(email: string): Promise<boolean> {
    this.setState({ phase: 'sending' });
    const result = await requestOtp(email);

    if (!result.ok) {
      this.setState({ phase: 'error', message: result.error });
      return false;
    }

    const expiresAt = new Date(result.data.expiresAt);
    const resendAt  = new Date(Date.now() + RESEND_COOLDOWN_SEC * 1000);
    this.setState({ phase: 'sent', email, expiresAt, resendAt });
    return true;
  }

  async confirmOtp(email: string, otp: string): Promise<string | null> {
    this.setState({ phase: 'verifying' });
    const result = await verifyOtp(email, otp);

    if (!result.ok) {
      const sentState = { phase: 'sent' as const, email, expiresAt: new Date(), resendAt: new Date() };
      this.setState({ ...sentState, phase: 'error', message: result.error } as OtpState);
      // Revert to sent phase after showing error briefly
      setTimeout(() => this.setState(sentState), 3000);
      return null;
    }

    if (!result.data.verified) {
      this.setState({ phase: 'error', message: 'Incorrect OTP. Please check and try again.' });
      return null;
    }

    this.setState({ phase: 'verified', email, token: result.data.token });
    return result.data.token;
  }

  reset() { this.setState({ phase: 'idle' }); }
}

// Singleton for use across booking flow
export const otpService = new OtpService();

// ── OTP input helpers ─────────────────────────────────────
/** Handles keyboard navigation between OTP digit inputs */
export function handleOtpKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  index: number,
  inputs: HTMLInputElement[]
) {
  if (e.key === 'Backspace' && !(e.currentTarget.value) && index > 0) {
    inputs[index - 1]?.focus();
  }
}

export function handleOtpInput(
  e: React.ChangeEvent<HTMLInputElement>,
  index: number,
  digits: string[],
  setDigits: (d: string[]) => void,
  inputs: HTMLInputElement[]
) {
  const value = e.target.value.replace(/\D/g, '').slice(-1);
  const next = [...digits];
  next[index] = value;
  setDigits(next);
  if (value && index < 5) {
    inputs[index + 1]?.focus();
  }
}
