// src/components/islands/QuickConsultForm.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppStore } from '../../stores/appStore';
import { otpService } from '../../services/otp';
import { submitQuickConsult } from '../../lib/api';
import { initiatePayment } from '../../services/payment';

const schema = z.object({
  name:      z.string().min(2, 'Minimum 2 characters'),
  email:     z.string().email('Enter a valid email'),
  phone:     z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit number'),
  question1: z.string().min(10, 'Minimum 10 characters'),
  question2: z.string().optional(),
  question3: z.string().optional(),
});
type FormData = z.infer<typeof schema>;
type Phase = 'form' | 'otp' | 'payment' | 'success';

export default function QuickConsultForm() {
  const { boot } = useAppStore();
  const [phase,     setPhase]     = useState<Phase>('form');
  const [formData,  setFormData]  = useState<FormData | null>(null);
  const [otpDigits, setOtpDigits] = useState(['','','','','','']);
  const [error,     setError]     = useState('');
  const [consultId, setConsultId] = useState('');

  const qc           = boot?.content?.quickConsult;
  const price        = (qc?.price as number) ?? 49900;
  const priceDisplay = (qc?.priceDisplay as string) ?? '₹499';
  const config       = boot?.config;

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onFormSubmit = async (data: FormData) => {
    setError('');
    setFormData(data);
    const ok = await otpService.sendOtp(data.email);
    if (ok) setPhase('otp');
    else    setError('Failed to send OTP. Please try again.');
  };

  const verifyOtp = async () => {
    const code = otpDigits.join('');
    if (code.length < 6) return;
    const token = await otpService.confirmOtp(formData!.email, code);
    if (token) setPhase('payment');
    else       setError('Incorrect OTP. Please check and retry.');
  };

  const pay = async () => {
    if (!formData) return;
    setError('');
    const result = await initiatePayment({
      serviceId:   'quick_consult',
      amount:      price,
      currency:    config?.currencyCode || 'INR',
      bookingId:   `qc_${Date.now()}`,
      slotId:      'quick_consult',
      lockToken:   'qc_token',
      name:        formData.name,
      email:       formData.email,
      phone:       formData.phone,
      description: 'Quick Consultation (up to 3 questions)',
      siteName:    config?.siteName || 'Jyotish Consultations',
    });
    if (result.status === 'success') {
      const res = await submitQuickConsult({
        name: formData.name, email: formData.email, phone: formData.phone,
        questions: [formData.question1, formData.question2, formData.question3] as [string,string?,string?],
        razorpayPaymentId: result.confirm.bookingId, razorpayOrderId: '',
      });
      if (res.ok) { setConsultId(res.data.consultId); setPhase('success'); }
      else        { setError('Payment received but submission failed. Contact support.'); }
    } else if (result.status === 'failed') {
      setError(result.error);
    }
  };

  if (phase === 'success') return (
    <div style={{ background: 'white', border: '1px solid var(--color-mist)', borderRadius: 24, padding: 36, textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--color-voltage-violet)', marginBottom: 10 }}>Questions Received!</h2>
      <p style={{ fontSize: 15, color: 'var(--color-slate)', lineHeight: 1.7 }}>
        You'll receive your personalised written response at{' '}
        <strong style={{ color: 'var(--color-midnight-ink)' }}>{formData?.email}</strong>{' '}
        within {(qc?.turnaroundHours as number) || 24} hours.
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-slate)', marginTop: 12 }}>Ref: {consultId}</p>
    </div>
  );

  return (
    <div style={{ background: 'white', border: '1px solid var(--color-mist)', borderRadius: 24, padding: 36 }}>
      {/* Pricing banner */}
      {qc && (
        <div style={{ background: 'var(--color-lavender-field)', borderRadius: 14, padding: '18px 20px', textAlign: 'center', marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ultra-violet)', marginBottom: 6 }}>Investment</p>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 600, color: 'var(--color-voltage-violet)', lineHeight: 1, marginBottom: 6 }}>
            {priceDisplay}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-slate)' }}>
            Up to {(qc?.maxQuestions as number) || 3} questions · Written answers · Within {(qc?.turnaroundHours as number) || 24} hours
          </p>
        </div>
      )}

      {error && <div className="banner banner-error mb-20">{error}</div>}

      {/* Form */}
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
          {[
            { key: 'question1', label: 'Question 1 *', required: true },
            { key: 'question2', label: 'Question 2', required: false },
            { key: 'question3', label: 'Question 3', required: false },
          ].map(q => (
            <div className="form-group mb-16" key={q.key}>
              <label className="form-label">{q.label}</label>
              <textarea className="form-input" rows={2} placeholder="Be as specific as possible for the best answer…" {...register(q.key as keyof FormData)} />
              {q.key === 'question1' && errors.question1 && <p className="form-error">{errors.question1.message}</p>}
            </div>
          ))}
          <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 8 }}>
            Verify Email & Pay {priceDisplay}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </form>
      )}

      {/* OTP */}
      {phase === 'otp' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Verify Email</h3>
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginBottom: 24 }}>
            Code sent to <strong style={{ color: 'var(--color-midnight-ink)' }}>{formData?.email}</strong>
          </p>
          <div className="otp-group mb-24">
            {otpDigits.map((d, i) => (
              <input key={i} className="otp-digit" type="text" inputMode="numeric" maxLength={1} value={d}
                autoFocus={i === 0}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g,'').slice(-1);
                  const next = [...otpDigits]; next[i] = val; setOtpDigits(next);
                }} />
            ))}
          </div>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={verifyOtp}>
            Verify & Continue to Payment
          </button>
        </div>
      )}

      {/* Payment */}
      {phase === 'payment' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Complete Payment</h3>
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginBottom: 24 }}>Email verified ✓ — Proceed to secure checkout</p>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center', fontSize: 16 }} onClick={pay}>
            Pay {priceDisplay} Securely
          </button>
          <p style={{ fontSize: 12, color: 'var(--color-slate)', marginTop: 12 }}>Powered by Razorpay · All cards, UPI, net banking</p>
        </div>
      )}
    </div>
  );
}
