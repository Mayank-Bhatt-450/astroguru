// src/components/booking/BookingModal.tsx
// ============================================================
// Booking flow: form → addons → otp → payment → success
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppStore, selectConfig, selectAddons } from '../../stores/appStore';
import { otpService } from '../../services/otp';
import { initiatePayment } from '../../services/payment';
import { checkSlotAvailability, submitBirthDetails, devConfirmBooking } from '../../lib/api';
import { formatSlotDuration } from '../../lib/slots';
import { SKIP_PAYMENT } from '../../lib/flags';
import type { BookingFormData, BirthDetailsData, ConfirmResult } from '../../lib/types';
import { slotsCache } from '../../lib/cache';
import AddonsStep from './AddonsStep';

// ── Validation ────────────────────────────────────────────
const contactSchema = z.object({
  name:  z.string().min(2, 'Minimum 2 characters'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
});
const birthSchema = z.object({
  dateOfBirth:     z.string().min(1, 'Date of birth is required'),
  timeOfBirth:     z.string(),
  cityOfBirth:     z.string().min(2, 'City is required'),
  additionalNotes: z.string().optional(),
});

function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5"
      style={{ animation: 'modal-spin 0.8s linear infinite', flexShrink: 0 }}>
      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round"/>
      <style>{`@keyframes modal-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

// ── Lock Countdown Bar ─────────────────────────────────────
function LockCountdown({ expiresAt }: { expiresAt: string }) {
  const TOTAL_MS = 15 * 60 * 1000;
  const [msLeft, setMsLeft] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now())
  );

  useEffect(() => {
    const id = setInterval(() => {
      setMsLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const pct      = Math.min(100, (msLeft / TOTAL_MS) * 100);
  const minsLeft = Math.floor(msLeft / 60000);
  const secsLeft = Math.floor((msLeft % 60000) / 1000);
  const isUrgent = msLeft < 2 * 60 * 1000;

  if (msLeft === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ height: 3, background: 'var(--color-mist)', borderRadius: 9999, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{
          height: '100%', borderRadius: 9999,
          width: `${pct}%`,
          background: isUrgent ? '#ef4444' : 'var(--color-voltage-violet)',
          transition: 'width 1s linear, background 0.3s',
        }} />
      </div>
      <p style={{ fontSize: 11, fontWeight: 600, textAlign: 'right', color: isUrgent ? '#ef4444' : 'var(--color-slate)' }}>
        {isUrgent && '⚠ '}
        Slot held for {minsLeft}:{secsLeft.toString().padStart(2, '0')}
      </p>
    </div>
  );
}

// ── Steps bar — now includes 'addons' ─────────────────────
function StepsBar({ step }: { step: string }) {
  const steps  = ['form', 'addons', 'otp', 'payment', 'success'];
  const labels = ['Details', 'Add-ons', 'Verify', 'Payment', 'Confirmed'];
  const idx    = steps.indexOf(step);
  return (
    <div className="steps-bar">
      {steps.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div className={`step-node ${i < idx ? 'done' : i === idx ? 'active' : ''}`}>
              {i < idx ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap',
              color: i === idx ? 'var(--color-voltage-violet)'
                   : i < idx  ? '#10b981'
                   : 'var(--color-slate)',
            }}>
              {labels[i]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`step-connector ${i < idx ? 'done' : ''}`} style={{ marginBottom: 16 }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Slot + Addons Summary ─────────────────────────────────
function SlotSummary() {
  const { selectedSlot, selectedService, boot, userTimezone, selectedAddonIds } = useAppStore();
  if (!selectedSlot || !selectedService) return null;

  const pricing = boot?.pricing.find(p => p.serviceId === selectedService.id);
  const addons  = boot?.addons ?? [];
  const selectedAddons = addons.filter(a => selectedAddonIds.includes(a.id));
  const addonsTotal    = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const totalPrice     = (pricing?.price ?? 0) + addonsTotal;
  const currencySymbol = boot?.config.currencySymbol ?? '₹';
  const formatPrice    = (p: number) => `${currencySymbol}${(p / 100).toLocaleString('en-IN')}`;

  return (
    <div style={{
      background: 'var(--color-lavender-field)', borderRadius: 14,
      padding: '14px 18px', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-midnight-ink)', marginBottom: 3 }}>
            {selectedService.iconEmoji} {selectedService.name}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-slate)' }}>
            {selectedSlot.startLocal.toLocaleDateString('en-US', {
              timeZone: userTimezone, weekday: 'short', month: 'short', day: 'numeric',
            })}
            {' · '}{selectedSlot.timeLabel}
            {' · '}{formatSlotDuration(selectedSlot.durationMinutes)}
          </div>
          {selectedAddons.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-ultra-violet)', marginTop: 4, fontWeight: 500 }}>
              + {selectedAddons.map(a => a.name).join(', ')}
            </div>
          )}
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
          color: 'var(--color-voltage-violet)', whiteSpace: 'nowrap',
        }}>
          {formatPrice(totalPrice)}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Contact Form ──────────────────────────────────
function ContactStep({
  onNext,
  lockExpiresAt,
}: {
  onNext: (d: BookingFormData) => Promise<void>;
  lockExpiresAt: string | null;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<BookingFormData>({
    resolver: zodResolver(contactSchema),
  });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (data: BookingFormData) => {
    setSubmitting(true);
    await onNext(data);
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SlotSummary />
      {lockExpiresAt && <LockCountdown expiresAt={lockExpiresAt} />}

      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, marginBottom: 20 }}>
        Your Details
      </h3>

      <div className="form-group mb-14">
        <label className="form-label">Full Name</label>
        <input className={`form-input ${errors.name ? 'error' : ''}`}
          placeholder="Your full name" {...register('name')} />
        {errors.name && <p className="form-error">{errors.name.message}</p>}
      </div>
      <div className="form-group mb-14">
        <label className="form-label">Email Address</label>
        <input type="email" className={`form-input ${errors.email ? 'error' : ''}`}
          placeholder="you@example.com" {...register('email')} />
        {errors.email && <p className="form-error">{errors.email.message}</p>}
      </div>
      <div className="form-group mb-24">
        <label className="form-label">Mobile Number</label>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            fontSize: 14, color: 'var(--color-graphite)', fontWeight: 500,
          }}>+91</span>
          <input type="tel" className={`form-input ${errors.phone ? 'error' : ''}`}
            style={{ paddingLeft: 44 }}
            placeholder="9876543210" maxLength={10} {...register('phone')} />
        </div>
        {errors.phone && <p className="form-error">{errors.phone.message}</p>}
      </div>

      <button type="submit" className="btn btn-primary w-full"
        style={{ justifyContent: 'center', fontSize: 15 }} disabled={submitting}>
        {submitting ? <><Spinner color="white" /> Please wait…</> : 'Continue →'}
      </button>
    </form>
  );
}

// ── Step 2: OTP ───────────────────────────────────────────
function OtpStep({
  email, onVerified, onBack, lockExpiresAt,
}: {
  email: string;
  onVerified: (token: string) => void;
  onBack: () => void;
  lockExpiresAt: string | null;
}) {
  const [digits,   setDigits]  = useState(['','','','','','']);
  const [phase,    setPhase]   = useState<'sending'|'sent'|'verifying'|'error'>('sending');
  const [errMsg,   setErrMsg]  = useState('');
  const [resendIn, setResendIn] = useState(0);
  const refs = useRef<(HTMLInputElement|null)[]>([]);

  const sendOtp = useCallback(async () => {
    setPhase('sending');
    const ok = await otpService.sendOtp(email);
    if (ok) { setPhase('sent'); setResendIn(60); } else { setPhase('error'); setErrMsg('Failed to send OTP.'); }
  }, [email]);

  useEffect(() => { sendOtp(); }, [sendOtp]);
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
    const val  = e.target.value.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[i] = val; setDigits(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Backspace' && !e.currentTarget.value && i > 0) refs.current[i - 1]?.focus();
  };

  const verify = async (code: string) => {
    setPhase('verifying');
    const token = await otpService.confirmOtp(email, code);
    if (token) { onVerified(token); }
    else { setPhase('error'); setErrMsg('Incorrect code. Please try again.'); setDigits(['','','','','','']); refs.current[0]?.focus(); }
  };

  return (
    <div>
      <SlotSummary />
      {lockExpiresAt && <LockCountdown expiresAt={lockExpiresAt} />}

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          Verify Your Email
        </h3>
        <p style={{ fontSize: 14, color: 'var(--color-slate)', lineHeight: 1.6 }}>
          {phase === 'sending' ? 'Sending code…' : <>Code sent to <strong style={{ color: 'var(--color-midnight-ink)' }}>{email}</strong></>}
        </p>
      </div>

      {errMsg && <div className="banner banner-error mb-16">{errMsg}</div>}

      <div className="otp-group mb-24">
        {digits.map((d, i) => (
          <input key={i} ref={el => { refs.current[i] = el; }}
            className="otp-digit" type="text" inputMode="numeric"
            maxLength={1} value={d}
            onChange={e => onChange(e, i)}
            onKeyDown={e => onKeyDown(e, i)}
            disabled={phase === 'verifying'}
            autoFocus={i === 0}
          />
        ))}
      </div>

      <button className="btn btn-primary w-full mb-12"
        style={{ justifyContent: 'center' }}
        onClick={() => verify(digits.join(''))}
        disabled={digits.join('').length < 6 || phase === 'verifying'}>
        {phase === 'verifying' ? <><Spinner color="white" /> Verifying…</> : 'Confirm OTP'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} style={{ fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Change email
        </button>
        {resendIn > 0
          ? <span style={{ fontSize: 13, color: 'var(--color-slate)' }}>Resend in {resendIn}s</span>
          : <button onClick={sendOtp} style={{ fontSize: 13, color: 'var(--color-voltage-violet)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
              Resend OTP
            </button>
        }
      </div>
    </div>
  );
}

// ── Step: Dev payment bypass ──────────────────────────────
function DevPaymentBypass({ onConfirmed }: { onConfirmed: (r: ConfirmResult) => void }) {
  const { selectedSlot, selectedService, bookingForm, lockToken, lockExpiresAt, bookingId } = useAppStore();
  const [phase,  setPhase]  = useState<'idle'|'confirming'|'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const confirm = async () => {
    if (!selectedSlot || !selectedService || !bookingForm || !lockToken || !bookingId) {
      setErrMsg('Missing booking data. Please close and try again.'); return;
    }
    setPhase('confirming'); setErrMsg('');
    const adminToken = import.meta.env.PUBLIC_DEV_ADMIN_TOKEN || '';
    const result = await devConfirmBooking({
      bookingId, slotId: selectedSlot.id, lockToken,
      name: bookingForm.name, email: bookingForm.email, phone: bookingForm.phone,
      serviceId: selectedService.id, adminToken,
    });
    if (!result.ok) { setPhase('error'); setErrMsg(result.error); return; }
    slotsCache.invalidateAll(); setPhase('idle'); onConfirmed(result.data);
  };

  return (
    <div>
      <SlotSummary />
      {lockExpiresAt && <LockCountdown expiresAt={lockExpiresAt} />}
      <div style={{ background: '#fef3c7', border: '2px dashed #f59e0b', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13, color: '#92400e', marginBottom: 3 }}>DEV MODE — Payment Bypassed</p>
          <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
            <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 3 }}>PUBLIC_SKIP_PAYMENT=true</code>{' '}
            Razorpay is skipped but all backend work still runs.
          </p>
        </div>
      </div>
      {errMsg && <div className="banner banner-error mb-16"><span>⚠ {errMsg}</span></div>}
      <button className="btn w-full" style={{ justifyContent: 'center', fontSize: 16, background: '#10b981', color: 'white', boxShadow: '0 4px 20px rgba(16,185,129,0.3)' }} onClick={confirm} disabled={phase === 'confirming'}>
        {phase === 'confirming' ? <><Spinner color="white" /> Creating booking…</> : '✓ Confirm Booking (Dev Bypass)'}
      </button>
    </div>
  );
}

// ── Step: Real payment ────────────────────────────────────
function RealPaymentStep({ onSuccess, onFailed }: { onSuccess: (r: ConfirmResult) => void; onFailed: (e: string) => void }) {
  const { selectedSlot, selectedService, bookingForm, lockToken, lockExpiresAt, bookingId, boot, selectedAddonIds } = useAppStore();
  const config  = useAppStore(selectConfig);
  const pricing = boot?.pricing.find(p => p.serviceId === selectedService?.id);
  const addons  = boot?.addons ?? [];
  const selectedAddons  = addons.filter(a => selectedAddonIds.includes(a.id));
  const addonsTotal     = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const totalPrice      = (pricing?.price ?? 0) + addonsTotal;
  const currencySymbol  = boot?.config.currencySymbol ?? '₹';
  const formatPrice     = (p: number) => `${currencySymbol}${(p / 100).toLocaleString('en-IN')}`;
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    if (!selectedSlot || !selectedService || !bookingForm || !lockToken || !pricing || !bookingId) return;
    setPaying(true);
    const result = await initiatePayment({
      serviceId:   selectedService.id,
      amount:      totalPrice,
      currency:    config?.currencyCode || 'INR',
      bookingId,
      slotId:      selectedSlot.id,
      lockToken,
      name:        bookingForm.name,
      email:       bookingForm.email,
      phone:       bookingForm.phone,
      description: `${selectedService.name} — ${selectedSlot.timeLabel}`,
      siteName:    config?.siteName || 'AstroGuru',
    });
    setPaying(false);
    if (result.status === 'success')    { slotsCache.invalidateAll(); onSuccess(result.confirm); }
    else if (result.status === 'dismissed') { /* slot still locked */ }
    else { onFailed(result.error); }
  };

  return (
    <div>
      <SlotSummary />
      {lockExpiresAt && <LockCountdown expiresAt={lockExpiresAt} />}
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Secure Payment</h3>
      {!pricing && <div className="banner banner-error mb-16">Could not load pricing. Please close and try again.</div>}
      {pricing && (
        <>
          <div className="card mb-20" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--color-graphite)' }}>{selectedService?.name}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{pricing.priceDisplay}</span>
            </div>
            {selectedAddons.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--color-slate)' }}>+ {a.name}</span>
                <span style={{ fontSize: 13, color: 'var(--color-slate)' }}>+{a.priceDisplay}</span>
              </div>
            ))}
            {selectedAddons.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-mist)', marginTop: 8, paddingTop: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Total</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-voltage-violet)' }}>{formatPrice(totalPrice)}</span>
              </div>
            )}
          </div>
          {lockToken && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#d1fae5', borderRadius: 10 }}>
              <p style={{ fontSize: 12, color: '#065f46', fontWeight: 500 }}>✓ Your slot is reserved and waiting for payment</p>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
            {[['🔐','SSL Secured'],['💳','Cards & UPI'],['🔒','No data stored']].map(([icon, label]) => (
              <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 13 }}>{icon}</span>
                <span style={{ fontSize: 12, color: 'var(--color-slate)' }}>{label}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center', fontSize: 16 }} onClick={pay} disabled={paying}>
            {paying ? <><Spinner color="white" /> Processing…</> : `Pay ${formatPrice(totalPrice)} Securely`}
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-slate)', marginTop: 12 }}>Powered by Razorpay · 100% Secure</p>
        </>
      )}
    </div>
  );
}

// ── Step: Success ─────────────────────────────────────────
function SuccessStep() {
  const { confirmResult } = useAppStore();
  const bookingId = confirmResult?.bookingId ?? null;
  const [phase,  setPhase]  = useState<'success'|'birth'|'done'>('success');
  const [busy,   setBusy]   = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<BirthDetailsData>({ resolver: zodResolver(birthSchema) });

  const onBirthSubmit = async (data: BirthDetailsData) => {
    if (!bookingId) { setErrMsg('Booking reference not found. Please contact support.'); return; }
    setBusy(true); setErrMsg('');
    const res = await submitBirthDetails(bookingId, data);
    setBusy(false);
    if (res.ok) setPhase('done'); else setErrMsg(res.error);
  };

  if (phase === 'done') return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🙏</div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--color-voltage-violet)', marginBottom: 8 }}>All Done!</h3>
      <p style={{ fontSize: 15, color: 'var(--color-slate)', lineHeight: 1.7 }}>Details saved. Check your email for the Google Meet link and session info.</p>
    </div>
  );

  if (phase === 'birth') return (
    <form onSubmit={handleSubmit(onBirthSubmit)}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🌟</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Your Birth Details</h3>
        <p style={{ fontSize: 13, color: 'var(--color-slate)' }}>Helps prepare your personalised reading. Strictly private.</p>
      </div>
      {errMsg && <div className="banner banner-error mb-16">{errMsg}</div>}
      <div className="form-group mb-14">
        <label className="form-label">Date of Birth</label>
        <input type="date" className={`form-input ${errors.dateOfBirth ? 'error' : ''}`} {...register('dateOfBirth')} />
        {errors.dateOfBirth && <p className="form-error">{errors.dateOfBirth.message}</p>}
      </div>
      <div className="form-group mb-14">
        <label className="form-label">Time of Birth <span style={{ opacity: 0.5 }}>(if known)</span></label>
        <input type="time" className="form-input" {...register('timeOfBirth')} />
      </div>
      <div className="form-group mb-14">
        <label className="form-label">City of Birth</label>
        <input className={`form-input ${errors.cityOfBirth ? 'error' : ''}`} placeholder="e.g. Mumbai, India" {...register('cityOfBirth')} />
        {errors.cityOfBirth && <p className="form-error">{errors.cityOfBirth.message}</p>}
      </div>
      <div className="form-group mb-20">
        <label className="form-label">Anything else? <span style={{ opacity: 0.5 }}>(optional)</span></label>
        <textarea className="form-input" rows={2} placeholder="Specific questions or context…" {...register('additionalNotes')} />
      </div>
      <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }} disabled={busy}>
        {busy ? <><Spinner color="white" /> Saving…</> : 'Submit Details ✓'}
      </button>
    </form>
  );

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 16, animation: 'float 3s ease-in-out infinite', display: 'inline-block' }}>✨</div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--color-voltage-violet)', marginBottom: 8 }}>Booking Confirmed!</h3>
      {SKIP_PAYMENT && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
          ⚠️ Dev mode — no real payment was charged
        </div>
      )}
      <p style={{ fontSize: 15, color: 'var(--color-slate)', marginBottom: 20, lineHeight: 1.7 }}>
        Your session is reserved.{!SKIP_PAYMENT && ' A Google Meet link has been emailed to you.'}
      </p>
      {confirmResult?.meetLink && confirmResult.meetLink.startsWith('http') && !SKIP_PAYMENT && (
        <div className="card mb-20" style={{ padding: '14px 18px', textAlign: 'left' }}>
          <p style={{ fontSize: 11, color: 'var(--color-slate)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Your Google Meet Link</p>
          <a href={confirmResult.meetLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--color-voltage-violet)', wordBreak: 'break-all', fontWeight: 500 }}>{confirmResult.meetLink}</a>
        </div>
      )}
      <div className="banner banner-info mb-20" style={{ textAlign: 'left' }}>To prepare your personalised reading, please share your birth details below.</div>
      <button className="btn btn-primary w-full mb-10" style={{ justifyContent: 'center' }} onClick={() => setPhase('birth')}>✦ Provide Birth Details</button>
      <button style={{ fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer', width: '100%' }} onClick={() => setPhase('done')}>I'll do this later via email</button>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────
export default function BookingModal() {
  const {
    bookingOpen, bookingStep, closeBooking, openServicePicker,
    setBookingStep, setBookingForm, setOtpToken, setConfirmResult,
    bookingForm, selectedSlot, lockToken, lockExpiresAt,
  } = useAppStore();

  const [lockExpiredBanner, setLockExpiredBanner] = useState(false);
  const [paymentError,      setPaymentError]      = useState('');

  useEffect(() => {
    document.body.style.overflow = bookingOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [bookingOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && bookingOpen && bookingStep !== 'success') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [bookingOpen, bookingStep]);

  useEffect(() => {
    if (!lockExpiresAt || !bookingOpen || bookingStep === 'success') return;
    const remaining = new Date(lockExpiresAt).getTime() - Date.now();
    if (remaining <= 0) { handleLockExpired(); return; }
    const id = setTimeout(handleLockExpired, remaining);
    return () => clearTimeout(id);
  }, [lockExpiresAt, bookingOpen, bookingStep]);

  const handleLockExpired = useCallback(async () => {
    setLockExpiredBanner(true);
    if (selectedSlot && lockToken) {
      try { await import('../../lib/api').then(a => a.releaseSlot(selectedSlot.id, lockToken)); } catch { /* noop */ }
    }
    setTimeout(async () => {
      setLockExpiredBanner(false);
      await closeBooking();
      openServicePicker();
    }, 3000);
  }, [selectedSlot, lockToken, closeBooking, openServicePicker]);

  const handleClose = async () => {
    if (bookingStep === 'success') { await closeBooking(); return; }
    if (!window.confirm('Cancel your booking? Your held slot will be released.')) return;
    await closeBooking();
  };

  const handleFormNext = async (data: BookingFormData) => {
    if (!selectedSlot || !lockToken) return;
    const check = await checkSlotAvailability(selectedSlot.id);
    if (check.ok) {
      const { status } = check.data;
      if (status === 'booked') {
        setPaymentError('This slot was just confirmed by another user. Please choose a different time.');
        await closeBooking(); openServicePicker(); return;
      }
      if (status !== 'locked') {
        setPaymentError('Your slot reservation has expired. Please choose a new time.');
        await closeBooking(); openServicePicker(); return;
      }
    }
    setBookingForm(data);
    setBookingStep('addons'); // ← goes to add-ons step next
  };

  if (!bookingOpen) return null;

  return (
    <div className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="modal-panel animate-slide-up">

        {/* Lock expired overlay */}
        {lockExpiredBanner && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.96)',
            borderRadius: 'inherit', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: 32, textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 8, color: '#ef4444' }}>Slot Reservation Expired</h3>
            <p style={{ fontSize: 14, color: 'var(--color-slate)', lineHeight: 1.7 }}>Your 15-minute slot hold has expired. Returning you to the slot picker…</p>
            <div style={{ marginTop: 16 }}><Spinner size={24} color="var(--color-voltage-violet)" /></div>
          </div>
        )}

        {/* Close button */}
        {bookingStep !== 'success' && (
          <button className="modal-close" onClick={handleClose} aria-label="Close">✕</button>
        )}

        {/* Steps bar */}
        {bookingStep !== 'success' && <StepsBar step={bookingStep} />}

        {/* Payment error */}
        {paymentError && bookingStep !== 'success' && (
          <div className="banner banner-error mb-16"><span>⚠ {paymentError}</span></div>
        )}

        {bookingStep === 'form' && (
          <ContactStep onNext={handleFormNext} lockExpiresAt={lockExpiresAt} />
        )}

        {bookingStep === 'addons' && (
          <AddonsStep
            onNext={() => setBookingStep('otp')}
            onBack={() => setBookingStep('form')}
          />
        )}

        {bookingStep === 'otp' && bookingForm && (
          <OtpStep
            email={bookingForm.email}
            onVerified={token => { setOtpToken(token); setBookingStep('payment'); }}
            onBack={() => setBookingStep('addons')}
            lockExpiresAt={lockExpiresAt}
          />
        )}

        {bookingStep === 'payment' && (
          SKIP_PAYMENT
            ? <DevPaymentBypass onConfirmed={result => { setConfirmResult(result); setBookingStep('success'); }} />
            : <RealPaymentStep onSuccess={result => { setConfirmResult(result); setBookingStep('success'); }} onFailed={err => setPaymentError(err)} />
        )}

        {bookingStep === 'success' && <SuccessStep />}
      </div>
    </div>
  );
}