// src/components/booking/BookingModal.tsx
// 5-step booking flow using the Supahub design system

import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppStore, selectConfig } from '../../stores/appStore';
import { otpService } from '../../services/otp';
import { initiatePayment } from '../../services/payment';
import { lockSlot, submitBirthDetails } from '../../lib/api';
import { formatSlotDuration } from '../../lib/slots';
import type { BookingFormData, BirthDetailsData, ConfirmResult } from '../../lib/types';

// ── Schemas ───────────────────────────────────────────────
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

// ── Steps bar ─────────────────────────────────────────────
function StepsBar({ step }: { step: string }) {
  const order = ['form','otp','payment','success'];
  const idx   = order.indexOf(step);
  return (
    <div className="steps-bar">
      {order.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < order.length - 1 ? 1 : 'none' }}>
          <div className={`step-node ${i < idx ? 'done' : i === idx ? 'active' : ''}`}>
            {i < idx ? '✓' : i + 1}
          </div>
          {i < order.length - 1 && (
            <div className={`step-connector ${i < idx ? 'done' : ''}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Slot Summary Banner ───────────────────────────────────
function SlotSummary() {
  const { selectedSlot, selectedService, boot, userTimezone } = useAppStore();
  if (!selectedSlot || !selectedService) return null;
  const pricing = boot?.pricing.find(p => p.serviceId === selectedService.id);

  return (
    <div style={{
      background: 'var(--color-lavender-field)', borderRadius: 14,
      padding: '14px 18px', marginBottom: 24, display: 'flex',
      justifyContent: 'space-between', alignItems: 'center', gap: 12,
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-midnight-ink)', marginBottom: 3 }}>
          {selectedService.iconEmoji} {selectedService.name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-slate)' }}>
          {selectedSlot.startLocal.toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'short', month: 'short', day: 'numeric' })}
          {' '}· {selectedSlot.timeLabel}
          {' '}· {formatSlotDuration(selectedSlot.durationMinutes)}
        </div>
      </div>
      {pricing && (
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--color-voltage-violet)', whiteSpace: 'nowrap' }}>
          {pricing.priceDisplay}
        </div>
      )}
    </div>
  );
}

// ── Step 1: Contact Form ──────────────────────────────────
function ContactStep({ onNext }: { onNext: (d: BookingFormData) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<BookingFormData>({
    resolver: zodResolver(contactSchema),
  });
  return (
    <form onSubmit={handleSubmit(onNext)}>
      <SlotSummary />
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Your Details</h3>
      <div className="form-group mb-16">
        <label className="form-label">Full Name</label>
        <input className={`form-input ${errors.name ? 'error' : ''}`} placeholder="Your full name" {...register('name')} />
        {errors.name && <p className="form-error">{errors.name.message}</p>}
      </div>
      <div className="form-group mb-16">
        <label className="form-label">Email Address</label>
        <input className={`form-input ${errors.email ? 'error' : ''}`} type="email" placeholder="you@example.com" {...register('email')} />
        {errors.email && <p className="form-error">{errors.email.message}</p>}
        <p className="form-hint">We'll send an OTP to verify your email.</p>
      </div>
      <div className="form-group mb-24">
        <label className="form-label">WhatsApp / Mobile</label>
        <input className={`form-input ${errors.phone ? 'error' : ''}`} type="tel" placeholder="10-digit mobile number" {...register('phone')} />
        {errors.phone && <p className="form-error">{errors.phone.message}</p>}
      </div>
      <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }}>
        Verify Email & Continue
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </form>
  );
}

// ── Step 2: OTP ───────────────────────────────────────────
function OtpStep({ email, onVerified, onBack }: { email: string; onVerified: (t: string) => void; onBack: () => void }) {
  const [digits,   setDigits]   = useState(['','','','','','']);
  const [phase,    setPhase]    = useState<'sending'|'sent'|'verifying'|'error'>('sending');
  const [errMsg,   setErrMsg]   = useState('');
  const [resendIn, setResendIn] = useState(0);
  const refs = useRef<(HTMLInputElement|null)[]>([]);

  useEffect(() => { sendOtp(); }, []);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn(n => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendOtp = async () => {
    setPhase('sending');
    const ok = await otpService.sendOtp(email);
    if (ok) { setPhase('sent'); setResendIn(60); }
    else    { setPhase('error'); setErrMsg('Failed to send OTP. Please try again.'); }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
    const val = e.target.value.replace(/\D/g,'').slice(-1);
    const next = [...digits]; next[i] = val; setDigits(next);
    if (val && i < 5) refs.current[i+1]?.focus();
    if (next.every(Boolean)) verify(next.join(''));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i-1]?.focus();
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
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Verify Your Email</h3>
        <p style={{ fontSize: 14, color: 'var(--color-slate)', lineHeight: 1.6 }}>
          {phase === 'sending' ? 'Sending code…' : <>Code sent to <strong style={{ color: 'var(--color-midnight-ink)' }}>{email}</strong></>}
        </p>
      </div>
      {errMsg && <div className="banner banner-error mb-16">{errMsg}</div>}
      <div className="otp-group mb-24">
        {digits.map((d, i) => (
          <input key={i} ref={el => { refs.current[i] = el; }} className="otp-digit"
            type="text" inputMode="numeric" maxLength={1} value={d}
            onChange={e => onChange(e, i)} onKeyDown={e => onKeyDown(e, i)}
            disabled={phase === 'verifying'} autoFocus={i === 0} />
        ))}
      </div>
      <button className="btn btn-primary w-full mb-12" style={{ justifyContent: 'center' }}
        onClick={() => verify(digits.join(''))}
        disabled={digits.join('').length < 6 || phase === 'verifying'}>
        {phase === 'verifying' ? 'Verifying…' : 'Confirm OTP'}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} style={{ fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer' }}>← Change email</button>
        {resendIn > 0
          ? <span style={{ fontSize: 13, color: 'var(--color-slate)' }}>Resend in {resendIn}s</span>
          : <button onClick={sendOtp} style={{ fontSize: 13, color: 'var(--color-voltage-violet)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Resend OTP</button>
        }
      </div>
    </div>
  );
}

// ── Step 3: Payment ───────────────────────────────────────
function PaymentStep({ onSuccess, onFailed }: { onSuccess: (r: ConfirmResult) => void; onFailed: (e: string) => void }) {
  const { selectedSlot, selectedService, bookingForm, setLockToken, boot } = useAppStore();
  const config  = useAppStore(selectConfig);
  const pricing = boot?.pricing.find(p => p.serviceId === selectedService?.id);

  const [status,    setStatus]    = useState<'locking'|'ready'|'paying'|'error'>('locking');
  const [errMsg,    setErrMsg]    = useState('');
  const lockRef = useRef<string | null>(null);
  const bidRef  = useRef<string>(`bkg_${Date.now()}`);

  useEffect(() => { lock(); }, []);

  const lock = async () => {
    if (!selectedSlot) return;
    setStatus('locking');
    const res = await lockSlot(selectedSlot.id, bidRef.current);
    if (!res.ok) { setStatus('error'); setErrMsg(res.error); return; }
    lockRef.current = res.data.lockToken;
    setLockToken(res.data.lockToken);
    setStatus('ready');
  };

  const pay = async () => {
    if (!selectedSlot || !selectedService || !bookingForm || !lockRef.current || !pricing) return;
    setStatus('paying');
    const result = await initiatePayment({
      serviceId:   selectedService.id,
      amount:      pricing.price,
      currency:    config?.currencyCode || 'INR',
      bookingId:   bidRef.current,
      slotId:      selectedSlot.id,
      lockToken:   lockRef.current,
      name:        bookingForm.name,
      email:       bookingForm.email,
      phone:       bookingForm.phone,
      description: `${selectedService.name} — ${selectedSlot.timeLabel}`,
      siteName:    config?.siteName || 'Jyotish Consultations',
    });
    if (result.status === 'success')   { onSuccess(result.confirm); }
    else if (result.status === 'dismissed') { setStatus('ready'); }
    else { setStatus('error'); setErrMsg(result.error); }
  };

  return (
    <div>
      <SlotSummary />
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Secure Payment</h3>
      {status === 'locking' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: 'var(--color-slate)' }}>Holding your slot…</p>
        </div>
      )}
      {status === 'error' && (
        <div>
          <div className="banner banner-error mb-16">{errMsg}</div>
          <button className="btn btn-ghost w-full" style={{ justifyContent: 'center' }} onClick={lock}>Try Again</button>
        </div>
      )}
      {(status === 'ready' || status === 'paying') && pricing && (
        <div>
          <div className="card mb-20" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--color-graphite)' }}>{selectedService?.name}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--color-midnight-ink)' }}>{pricing.priceDisplay}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--color-slate)' }}>Duration</span>
              <span style={{ fontSize: 13, color: 'var(--color-slate)' }}>{selectedSlot?.durationMinutes} min</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
            {[['🔐','SSL Secured'],['💳','Cards & UPI'],['🔒','No data stored']].map(([icon,label]) => (
              <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 13 }}>{icon}</span>
                <span style={{ fontSize: 12, color: 'var(--color-slate)' }}>{label}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center', fontSize: 16 }} onClick={pay} disabled={status === 'paying'}>
            {status === 'paying' ? 'Processing…' : `Pay ${pricing.priceDisplay} Securely`}
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-slate)', marginTop: 12 }}>
            Powered by Razorpay · 100% Secure
          </p>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Success + Birth Details ──────────────────────
function SuccessStep() {
  const { confirmResult, bookingId } = useAppStore();
  const [phase,  setPhase]  = useState<'success'|'birth'|'done'>('success');
  const [busy,   setBusy]   = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<BirthDetailsData>({
    resolver: zodResolver(birthSchema),
  });

  const onBirthSubmit = async (data: BirthDetailsData) => {
    if (!bookingId) return;
    setBusy(true); setErrMsg('');
    const res = await submitBirthDetails(bookingId, data);
    setBusy(false);
    if (res.ok) setPhase('done');
    else setErrMsg(res.error);
  };

  if (phase === 'done') return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🙏</div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--color-voltage-violet)', marginBottom: 8 }}>All Done!</h3>
      <p style={{ fontSize: 15, color: 'var(--color-slate)', lineHeight: 1.7 }}>
        Details saved. Check your email for the Google Meet link and session info.
      </p>
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
        {busy ? 'Saving…' : 'Submit Details ✓'}
      </button>
    </form>
  );

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 16, animation: 'float 3s ease-in-out infinite', display: 'inline-block' }}>✨</div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--color-voltage-violet)', marginBottom: 8 }}>
        Booking Confirmed!
      </h3>
      <p style={{ fontSize: 15, color: 'var(--color-slate)', marginBottom: 20, lineHeight: 1.7 }}>
        Your session is reserved. A Google Meet link has been emailed to you.
      </p>
      {confirmResult?.meetLink && confirmResult.meetLink.startsWith('http') && (
        <div className="card mb-20" style={{ padding: '14px 18px' }}>
          <p style={{ fontSize: 11, color: 'var(--color-slate)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Your Google Meet Link</p>
          <a href={confirmResult.meetLink} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: 'var(--color-voltage-violet)', wordBreak: 'break-all', fontWeight: 500 }}>
            {confirmResult.meetLink}
          </a>
        </div>
      )}
      <div className="banner banner-info mb-20" style={{ textAlign: 'left' }}>
        To prepare your personalised reading, please share your birth details below.
      </div>
      <button className="btn btn-primary w-full mb-10" style={{ justifyContent: 'center' }} onClick={() => setPhase('birth')}>
        ✦ Provide Birth Details
      </button>
      <button style={{ fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer', width: '100%' }} onClick={() => setPhase('done')}>
        I'll do this later via email
      </button>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────
export default function BookingModal() {
  const { bookingOpen, bookingStep, closeBooking, setBookingStep, setBookingForm, setOtpToken, setConfirmResult, bookingForm } = useAppStore();

  const handleClose = () => {
    if (bookingStep === 'success') { closeBooking(); return; }
    if (window.confirm('Cancel your booking? Your held slot will be released.')) closeBooking();
  };

  if (!bookingOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="modal-panel animate-slide-up">
        {bookingStep !== 'success' && (
          <button className="modal-close" onClick={handleClose} aria-label="Close">✕</button>
        )}
        {bookingStep !== 'success' && <StepsBar step={bookingStep} />}

        {bookingStep === 'form' && (
          <ContactStep onNext={data => { setBookingForm(data); setBookingStep('otp'); }} />
        )}
        {bookingStep === 'otp' && bookingForm && (
          <OtpStep
            email={bookingForm.email}
            onVerified={token => { setOtpToken(token); setBookingStep('payment'); }}
            onBack={() => setBookingStep('form')}
          />
        )}
        {bookingStep === 'payment' && (
          <PaymentStep
            onSuccess={result => { setConfirmResult(result); setBookingStep('success'); }}
            onFailed={err => console.error('[Payment]', err)}
          />
        )}
        {bookingStep === 'success' && <SuccessStep />}
      </div>
    </div>
  );
}
