// src/components/islands/QuickConsultForm.tsx
// ============================================================
// Quick Consultation booking flow:
//   form → OTP verify → payment (skipped if SKIP_PAYMENT) → submit → success
//
// Fixed bugs:
// - submissionInProgress ref always reset on every exit path
// - auto-verify and manual-verify cannot race (single in-flight flag)
// - paying state kept separate from submitting
// - idempotencyKey sent correctly at body level
// - no stale closure over otpDigits in auto-verify
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppStore } from '../../stores/appStore';
import { requestOtp, verifyOtp, submitQuickConsult } from '../../lib/api';
import { initiatePayment } from '../../services/payment';
import { SKIP_PAYMENT } from '../../lib/flags';

const schema = z.object({
  name:      z.string().min(2, 'Minimum 2 characters'),
  email:     z.string().email('Enter a valid email'),
  phone:     z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit number'),
  question1: z.string().min(10, 'Minimum 10 characters'),
  question2: z.string().optional(),
  question3: z.string().optional(),
});
type FormData = z.infer<typeof schema>;
type Phase = 'form' | 'otp' | 'payment' | 'submitting' | 'success';

function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5"
      style={{ animation: 'qc-spin 0.8s linear infinite', flexShrink: 0 }}>
      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round"/>
      <style>{`@keyframes qc-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

export default function QuickConsultForm() {
  const { boot }      = useAppStore();
  const qc            = boot?.content?.quickConsult;
  const price         = (qc?.price as number) ?? 49900;
  const priceDisplay  = (qc?.priceDisplay as string) ?? '₹499';
  const config        = boot?.config;

  const [phase,      setPhase]      = useState<Phase>('form');
  const [formData,   setFormData]   = useState<FormData | null>(null);
  const [digits,     setDigits]     = useState(['','','','','','']);
  const [error,      setError]      = useState('');
  const [consultId,  setConsultId]  = useState('');
  // Single busy flag covers verify + submit + pay — prevents any double-submission
  const [busy,       setBusy]       = useState(false);

  const inputRefs  = useRef<(HTMLInputElement | null)[]>([]);
  // This ref is the single source of truth for "a network call is in flight"
  // It is checked before every async operation and reset on EVERY exit path.
  const inFlight   = useRef(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // Reset inFlight if the component unmounts mid-flow (e.g. navigation)
  useEffect(() => () => { inFlight.current = false; }, []);

  // ── Helpers ────────────────────────────────────────────────
  const startBusy  = () => { inFlight.current = true;  setBusy(true);  };
  const clearBusy  = () => { inFlight.current = false; setBusy(false); };

  // ── Step 1: Collect form, send OTP ────────────────────────
  const onFormSubmit = async (data: FormData) => {
    if (inFlight.current) return;
    setError('');
    startBusy();
    setFormData(data);
    const result = await requestOtp(data.email);
    clearBusy();
    if (result.ok) {
      setPhase('otp');
      setDigits(['','','','','','']);
      setTimeout(() => inputRefs.current[0]?.focus(), 80);
    } else {
      setError(result.error || 'Failed to send OTP. Please try again.');
    }
  };

  // ── Step 2: Verify OTP then move to payment or submit ──────
  const runVerify = useCallback(async (code: string) => {
    if (inFlight.current || code.length < 6 || !formData) return;
    setError('');
    startBusy();

    const result = await verifyOtp(formData.email, code);
    if (!result.ok || !result.data.verified) {
      clearBusy();
      setError('Incorrect OTP. Please check and try again.');
      setDigits(['','','','','','']);
      setTimeout(() => inputRefs.current[0]?.focus(), 80);
      return;
    }

    // OTP verified — stay busy while deciding next step
    if (SKIP_PAYMENT) {
      await doSubmit(null);   // clearBusy called inside doSubmit
    } else {
      clearBusy();
      setPhase('payment');
    }
  }, [formData]);

  // ── OTP digit input ────────────────────────────────────────
  const handleDigitChange = (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    setDigits(prev => {
      const next = [...prev];
      next[i] = val;
      if (val && i < 5) {
        setTimeout(() => inputRefs.current[i + 1]?.focus(), 0);
      }
      // Auto-verify when all 6 digits filled
      if (next.every(Boolean)) {
        setTimeout(() => runVerify(next.join('')), 120);
      }
      return next;
    });
  };

  const handleDigitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  // ── Step 3: Submit to GAS (dev bypass OR post-payment) ─────
  const doSubmit = async (
    paymentProof: { razorpayPaymentId: string; razorpayOrderId: string } | null
  ) => {
    if (!formData) { clearBusy(); return; }

    setPhase('submitting');

    const idempotencyKey = `qc_${formData.email}_${Date.now()}`;

    const res = await submitQuickConsult({
      name:      formData.name,
      email:     formData.email,
      phone:     formData.phone,
      questions: [
        formData.question1,
        formData.question2 || undefined,
        formData.question3 || undefined,
      ] as [string, string?, string?],
      razorpayPaymentId: SKIP_PAYMENT ? 'dev_bypass' : (paymentProof?.razorpayPaymentId ?? ''),
      razorpayOrderId:   SKIP_PAYMENT ? 'dev_bypass' : (paymentProof?.razorpayOrderId   ?? ''),
      idempotencyKey,
    });

    clearBusy();   // always cleared here

    if (res.ok) {
      setConsultId(res.data.consultId);
      setPhase('success');
    } else {
      setError(`Submission failed: ${res.error}. Please try again.`);
      setPhase(SKIP_PAYMENT ? 'otp' : 'payment');
    }
  };

  // ── Step 3 (real): Razorpay payment then submit ────────────
  const pay = async () => {
    if (inFlight.current || !formData) return;
    setError('');
    startBusy();

    const result = await initiatePayment({
      serviceId:   'quick_consult',
      amount:      price,
      currency:    config?.currencyCode || 'INR',
      receiptId:   `qc_${Date.now()}`,
      name:        formData.name,
      email:       formData.email,
      phone:       formData.phone,
      description: 'Quick Consultation — up to 3 questions',
      siteName:    config?.siteName || 'AstroGuru',
      notes:       { type: 'quick_consult' },
      // No onDismiss needed — QC has no slot lock to release
    });

    if (result.status === 'success') {
      // Still busy — doSubmit will clearBusy
      await doSubmit({
        razorpayPaymentId: result.razorpayPaymentId,
        razorpayOrderId:   result.razorpayOrderId,
      });
    } else if (result.status === 'failed') {
      clearBusy();
      setError(result.error);
    } else {
      // dismissed — user closed checkout, stay on payment step
      clearBusy();
    }
  };

  // ── Success screen ─────────────────────────────────────────
  if (phase === 'success') {
    return (
      <div style={{ background: 'white', border: '1px solid var(--color-mist)', borderRadius: 24, padding: 'clamp(24px,5vw,40px)', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--color-voltage-violet)', marginBottom: 10 }}>
          Questions Received!
        </h2>
        {SKIP_PAYMENT && (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
            ⚠️ Dev mode — no payment charged
          </div>
        )}
        <p style={{ fontSize: 15, color: 'var(--color-slate)', lineHeight: 1.7 }}>
          You'll receive a personalised written response at{' '}
          <strong style={{ color: 'var(--color-midnight-ink)' }}>{formData?.email}</strong>{' '}
          within {(qc?.turnaroundHours as number) || 24} hours.
        </p>
        {consultId && (
          <p style={{ fontSize: 12, color: 'var(--color-slate)', marginTop: 10 }}>
            Reference: {consultId}
          </p>
        )}
        <a href="/" className="btn btn-ghost" style={{ marginTop: 28, display: 'inline-flex' }}>
          ← Back to Home
        </a>
      </div>
    );
  }

  return (
    <div style={{ background: 'white', border: '1px solid var(--color-mist)', borderRadius: 24, padding: 'clamp(20px,5vw,36px)' }}>

      {/* Dev mode banner */}
      {SKIP_PAYMENT && (
        <div style={{ background: '#fef3c7', border: '2px dashed #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5, margin: 0 }}>
            <strong>DEV MODE</strong> — Payment bypassed. Questions submitted after OTP.
          </p>
        </div>
      )}

      {/* Pricing banner */}
      {qc && phase === 'form' && (
        <div style={{ background: 'var(--color-lavender-field)', borderRadius: 14, padding: '16px 20px', textAlign: 'center', marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ultra-violet)', marginBottom: 4 }}>
            Investment
          </p>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, color: 'var(--color-voltage-violet)', lineHeight: 1, marginBottom: 4 }}>
            {SKIP_PAYMENT ? 'FREE (dev)' : priceDisplay}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-slate)', margin: 0 }}>
            Up to {(qc?.maxQuestions as number) || 3} questions · Written answers · Within {(qc?.turnaroundHours as number) || 24} hours
          </p>
        </div>
      )}

      {error && (
        <div className="banner banner-error mb-20">
          <span>⚠ {error}</span>
        </div>
      )}

      {/* ── Phase: Form ─────────────────────────────────────── */}
      {phase === 'form' && (
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Your Name</label>
              <input className={`form-input ${errors.name ? 'error' : ''}`} placeholder="Full name" {...register('name')} />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <input className={`form-input ${errors.phone ? 'error' : ''}`} type="tel" placeholder="10-digit number" {...register('phone')} />
              {errors.phone && <p className="form-error">{errors.phone.message}</p>}
            </div>
          </div>

          <div className="form-group mb-20">
            <label className="form-label">Email Address</label>
            <input className={`form-input ${errors.email ? 'error' : ''}`} type="email" placeholder="Answers will be delivered here" {...register('email')} />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>

          {(['question1', 'question2', 'question3'] as const).map((key, i) => (
            <div className="form-group mb-16" key={key}>
              <label className="form-label">
                Question {i + 1}{i === 0 ? ' *' : ' (optional)'}
              </label>
              <textarea
                className={`form-input ${key === 'question1' && errors.question1 ? 'error' : ''}`}
                rows={2}
                placeholder="Be as specific as possible for the best answer…"
                {...register(key)}
              />
              {key === 'question1' && errors.question1 && (
                <p className="form-error">{errors.question1.message}</p>
              )}
            </div>
          ))}

          <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 8 }} disabled={busy}>
            {busy
              ? <><Spinner size={16} color="white" /> Sending OTP…</>
              : <>Verify Email & {SKIP_PAYMENT ? 'Submit' : `Pay ${priceDisplay}`} →</>
            }
          </button>
        </form>
      )}

      {/* ── Phase: OTP ──────────────────────────────────────── */}
      {phase === 'otp' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
            Verify Your Email
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginBottom: 24 }}>
            Code sent to <strong style={{ color: 'var(--color-midnight-ink)' }}>{formData?.email}</strong>
          </p>

          <div className="otp-group mb-24">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                className="otp-digit"
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                autoFocus={i === 0}
                disabled={busy}
                onChange={e => handleDigitChange(e, i)}
                onKeyDown={e => handleDigitKeyDown(e, i)}
              />
            ))}
          </div>

          <button
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center' }}
            onClick={() => runVerify(digits.join(''))}
            disabled={busy || digits.join('').length < 6}
          >
            {busy
              ? <><Spinner size={16} color="white" /> Verifying…</>
              : `Verify & ${SKIP_PAYMENT ? 'Submit Questions' : 'Continue to Payment'}`
            }
          </button>

          <button
            style={{ marginTop: 12, fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}
            onClick={() => { setPhase('form'); setError(''); }}
            disabled={busy}
          >
            ← Change email
          </button>
        </div>
      )}

      {/* ── Phase: Submitting ────────────────────────────────── */}
      {phase === 'submitting' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spinner size={40} color="var(--color-voltage-violet)" />
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginTop: 16 }}>
            Submitting your questions…
          </p>
        </div>
      )}

      {/* ── Phase: Payment ──────────────────────────────────── */}
      {phase === 'payment' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Complete Payment
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginBottom: 12 }}>
            Email verified ✓
          </p>

          {/* Order summary */}
          <div style={{ background: 'var(--color-fog)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 14, color: 'var(--color-graphite)' }}>Quick Consultation</span>
              <span style={{ fontSize: 14, color: 'var(--color-graphite)' }}>{priceDisplay}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--color-mist)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Total</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--color-voltage-violet)' }}>
                {priceDisplay}
              </span>
            </div>
          </div>

          <button
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center', fontSize: 16 }}
            onClick={pay}
            disabled={busy}
          >
            {busy
              ? <><Spinner size={16} color="white" /> Opening checkout…</>
              : <>Pay {priceDisplay} Securely</>
            }
          </button>
          <p style={{ fontSize: 12, color: 'var(--color-slate)', marginTop: 12 }}>
            Powered by Razorpay · Cards, UPI, Net banking
          </p>
        </div>
      )}

    </div>
  );
}