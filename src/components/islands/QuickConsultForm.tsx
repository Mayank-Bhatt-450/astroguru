// src/components/islands/QuickConsultForm.tsx
// When PUBLIC_SKIP_PAYMENT=true the payment step is bypassed:
// submitQuickConsult() is called directly after OTP verification.

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppStore } from '../../stores/appStore';
import { otpService } from '../../services/otp';
import { submitQuickConsult, createRazorpayOrder } from '../../lib/api';
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
  const { boot } = useAppStore();
  const [phase,     setPhase]     = useState<Phase>('form');
  const [formData,  setFormData]  = useState<FormData | null>(null);
  const [otpDigits, setOtpDigits] = useState(['','','','','','']);
  const [error,     setError]     = useState('');
  const [consultId, setConsultId] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const qc           = boot?.content?.quickConsult;
  const price        = (qc?.price as number) ?? 49900;
  const priceDisplay = (qc?.priceDisplay as string) ?? '₹499';
  const config       = boot?.config;

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // ── Step 1: Collect form, send OTP ────────────────────────
  const onFormSubmit = async (data: FormData) => {
    setError('');
    setFormData(data);
    const ok = await otpService.sendOtp(data.email);
    if (ok) setPhase('otp');
    else    setError('Failed to send OTP. Please try again.');
  };

  // ── Step 2: Verify OTP ─────────────────────────────────────
  const verifyOtp = async () => {
    const code = otpDigits.join('');
    if (code.length < 6) { setError('Please enter all 6 digits.'); return; }
    setError('');
    const token = await otpService.confirmOtp(formData!.email, code);
    if (!token) { setError('Incorrect OTP. Please check and try again.'); return; }

    // ── SKIP_PAYMENT bypass: submit directly without payment ──
    if (SKIP_PAYMENT) {
      await submitDirect();
    } else {
      setPhase('payment');
    }
  };

  // ── Submit directly (dev bypass OR post-payment) ──────────
  const submitDirect = async () => {
    if (!formData) return;
    setPhase('submitting');
    setError('');

    const res = await submitQuickConsult({
      name:      formData.name,
      email:     formData.email,
      phone:     formData.phone,
      questions: [
        formData.question1,
        formData.question2,
        formData.question3,
      ] as [string, string?, string?],
      razorpayPaymentId: SKIP_PAYMENT ? 'dev_bypass' : '',
      razorpayOrderId:   SKIP_PAYMENT ? 'dev_bypass' : '',
    });

    if (res.ok) {
      setConsultId(res.data.consultId);
      setPhase('success');
    } else {
      setError(`Submission failed: ${res.error}`);
      setPhase(SKIP_PAYMENT ? 'otp' : 'payment');
    }
  };

  // ── Step 3: Real payment ───────────────────────────────────
  const pay = async () => {
    if (!formData) return;
    setError('');
    const result = await initiatePayment({
      serviceId:   'quick_consult',
      amount:      price,
      currency:    config?.currencyCode || 'INR',
      bookingId:   `qc_${Date.now()}`,
      slotId:      'quick_consult',
      lockToken:   'qc_no_lock',
      name:        formData.name,
      email:       formData.email,
      phone:       formData.phone,
      description: 'Quick Consultation (up to 3 questions)',
      siteName:    config?.siteName || 'Jyotish Consultations',
    });

    if (result.status === 'success') {
      await submitDirect();
    } else if (result.status === 'failed') {
      setError(result.error);
    }
    // dismissed — stay on payment step
  };

  // ── OTP input helpers ──────────────────────────────────────
  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits]; next[i] = val; setOtpDigits(next);
    if (val && i < 5) inputRefs.current[i + 1]?.focus();
    if (next.every(Boolean)) {
      // Auto-verify when all 6 digits entered
      setTimeout(() => {
        const code = next.join('');
        if (code.length === 6) {
          otpService.confirmOtp(formData!.email, code).then(token => {
            if (token) {
              if (SKIP_PAYMENT) submitDirect();
              else setPhase('payment');
            } else {
              setError('Incorrect OTP. Please try again.');
              setOtpDigits(['','','','','','']);
              inputRefs.current[0]?.focus();
            }
          });
        }
      }, 100);
    }
  };
  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  // ── Success ────────────────────────────────────────────────
  if (phase === 'success') return (
    <div style={{ background: 'white', border: '1px solid var(--color-mist)', borderRadius: 24, padding: 36, textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--color-voltage-violet)', marginBottom: 10 }}>
        Questions Received!
      </h2>
      {SKIP_PAYMENT && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
          ⚠️ Dev mode — no payment was charged
        </div>
      )}
      <p style={{ fontSize: 15, color: 'var(--color-slate)', lineHeight: 1.7 }}>
        You'll receive a personalised written response at{' '}
        <strong style={{ color: 'var(--color-midnight-ink)' }}>{formData?.email}</strong>{' '}
        within {(qc?.turnaroundHours as number) || 24} hours.
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-slate)', marginTop: 12 }}>
        Reference: {consultId}
      </p>
    </div>
  );

  return (
    <div style={{ background: 'white', border: '1px solid var(--color-mist)', borderRadius: 24, padding: 36 }}>

      {/* Dev mode banner */}
      {SKIP_PAYMENT && (
        <div style={{ background: '#fef3c7', border: '2px dashed #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
            <strong>DEV MODE</strong> — Payment bypassed (<code>PUBLIC_SKIP_PAYMENT=true</code>).
            Questions will be submitted directly after OTP verification.
          </p>
        </div>
      )}

      {/* Pricing banner */}
      {qc && (
        <div style={{ background: 'var(--color-lavender-field)', borderRadius: 14, padding: '18px 20px', textAlign: 'center', marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ultra-violet)', marginBottom: 6 }}>
            Investment
          </p>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 600, color: 'var(--color-voltage-violet)', lineHeight: 1, marginBottom: 6 }}>
            {SKIP_PAYMENT ? 'FREE (dev)' : priceDisplay}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-slate)' }}>
            Up to {(qc?.maxQuestions as number) || 3} questions · Written answers · Within {(qc?.turnaroundHours as number) || 24} hours
          </p>
        </div>
      )}

      {error && <div className="banner banner-error mb-20">{error}</div>}

      {/* ── Phase: Form ── */}
      {phase === 'form' && (
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
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
            <input className={`form-input ${errors.email ? 'error' : ''}`} type="email" placeholder="Answers delivered here" {...register('email')} />
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
          <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 8 }}>
            Verify Email {SKIP_PAYMENT ? '& Submit' : `& Pay ${priceDisplay}`}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </form>
      )}

      {/* ── Phase: OTP ── */}
      {phase === 'otp' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
            Verify Email
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginBottom: 24 }}>
            Code sent to <strong style={{ color: 'var(--color-midnight-ink)' }}>{formData?.email}</strong>
          </p>
          <div className="otp-group mb-24">
            {otpDigits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                className="otp-digit"
                type="text" inputMode="numeric" maxLength={1} value={d}
                autoFocus={i === 0}
                onChange={e => handleOtpChange(e, i)}
                onKeyDown={e => handleOtpKeyDown(e, i)}
              />
            ))}
          </div>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={verifyOtp}>
            Verify & {SKIP_PAYMENT ? 'Submit Questions' : 'Continue to Payment'}
          </button>
          <button
            style={{ marginTop: 12, fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}
            onClick={() => setPhase('form')}
          >
            ← Change email
          </button>
        </div>
      )}

      {/* ── Phase: Submitting (dev bypass) ── */}
      {phase === 'submitting' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Spinner size={36} color="var(--color-voltage-violet)" />
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginTop: 16 }}>
            Submitting your questions…
          </p>
        </div>
      )}

      {/* ── Phase: Payment ── */}
      {phase === 'payment' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
            Complete Payment
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginBottom: 24 }}>
            Email verified ✓ — Proceed to secure checkout
          </p>
          <button
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center', fontSize: 16 }}
            onClick={pay}
          >
            Pay {priceDisplay} Securely
          </button>
          <p style={{ fontSize: 12, color: 'var(--color-slate)', marginTop: 12 }}>
            Powered by Razorpay · All cards, UPI, net banking
          </p>
        </div>
      )}

    </div>
  );
}
