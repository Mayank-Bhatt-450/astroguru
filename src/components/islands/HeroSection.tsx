// src/components/islands/HeroSection.tsx
import { useEffect, useRef } from 'react';
import { useAppStore, selectContent, selectConfig } from '../../stores/appStore';

export default function HeroSection() {
  const bootStatus        = useAppStore(s => s.bootStatus);
  const content           = useAppStore(selectContent);
  const config            = useAppStore(selectConfig);
  const openServicePicker = useAppStore(s => s.openServicePicker);
  const hero              = content?.hero;
  const sectionRef        = useRef<HTMLElement>(null);

  const urgencyText =
    bootStatus === 'ready' && config?.urgency?.enabled && config.urgency.promoText
      ? config.urgency.promoText
      : 'Live Consultations Available';

  // Staggered entrance animation on mount
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const children = el.querySelectorAll('[data-animate]');
    children.forEach((child, i) => {
      (child as HTMLElement).style.opacity = '0';
      (child as HTMLElement).style.transform = 'translateY(24px)';
      setTimeout(() => {
        (child as HTMLElement).style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        (child as HTMLElement).style.opacity = '1';
        (child as HTMLElement).style.transform = 'translateY(0)';
      }, 120 + i * 110);
    });
  }, [bootStatus]);

  return (
    <section
      ref={sectionRef}
      className="section-lg orb-container"
      style={{
        position: 'relative',
        background: 'var(--color-pure-white)',
        overflow: 'hidden',
        paddingTop: 96,
        paddingBottom: 96,
      }}
    >
      {/* Gradient orbs — animated */}
      <div className="orb orb-violet orb-drift"  style={{ width: 600, height: 600, top: -120, left: -100, opacity: 0.7 }} />
      <div className="orb orb-pink orb-drift-slow"    style={{ width: 500, height: 500, top: 0, right: -80, opacity: 0.6 }} />
      <div className="orb orb-amber orb-drift"   style={{ width: 400, height: 400, bottom: -60, left: '40%', opacity: 0.4 }} />

      <div className="container" style={{ position: 'relative', zIndex: 1 }}>

        {/* Urgency badge */}
        <div data-animate style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <span
            className="badge badge-violet"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span className="pulse-dot" />
            {urgencyText}
          </span>
        </div>

        {/* Headline */}
        <div data-animate style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          {bootStatus === 'loading' ? (
            <>
              <div className="skeleton" style={{ height: 64, marginBottom: 16, borderRadius: 12 }} />
              <div className="skeleton" style={{ height: 64, width: '75%', margin: '0 auto 16px' }} />
            </>
          ) : (
            <h1
              className="text-display"
              style={{ marginBottom: 24 }}
              dangerouslySetInnerHTML={{
                __html: (hero?.headline || 'Ancient Wisdom.\nModern Clarity.')
                  .replace(/\n/g, '<br/>'),
              }}
            />
          )}

          {bootStatus === 'loading' ? (
            <>
              <div className="skeleton" style={{ height: 24, marginBottom: 10, borderRadius: 8 }} />
              <div className="skeleton" style={{ height: 24, width: '80%', margin: '0 auto 40px' }} />
            </>
          ) : (
            <p className="body-lg" style={{ maxWidth: 580, margin: '0 auto 40px' }}>
              {hero?.subheadline ||
                'Book a private 1-on-1 consultation for astrology, numerology, or Vastu Shastra. Personalised insights from an expert Vedic practitioner.'}
            </p>
          )}
        </div>

        {/* CTAs */}
        <div data-animate style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
          <button
            className="btn btn-primary btn-hero-pulse"
            style={{ fontSize: 16 }}
            onClick={() => openServicePicker()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/>
            </svg>
            {hero?.ctaText || 'Book a Consultation'}
          </button>
          <a href="/quick-consult" className="btn btn-ghost" style={{ fontSize: 16 }}>
            ⚡ Quick Consult
          </a>
        </div>

        {/* Social proof */}
        <div data-animate style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 80, flexWrap: 'wrap' }}>
          <div className="avatar-stack">
            {['PS','RV','AN','KM'].map((initials, i) => (
              <div
                key={i}
                className="avatar-stack-item"
                style={{ background: ['#ebdafd','#d6fcf4','#fce7f3','#dbeafe'][i] }}
              >
                {initials}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="star-row">
              {'★★★★★'.split('').map((s, i) => (
                <span key={i} className="star">{s}</span>
              ))}
            </span>
            <span className="social-proof-text">
              loved by{' '}
              {content?.about?.clientsServed
                ? `${(content.about.clientsServed as number).toLocaleString()}+`
                : '2,500+'}{' '}
              clients
            </span>
          </div>
        </div>

        {/* Stat cards */}
        <div data-animate className="stats-grid">
          {[
            { value: content?.about?.clientsServed ? `${content.about.clientsServed}+` : '2,500+', label: 'Lives Guided' },
            { value: content?.about?.yearsExperience ? `${content.about.yearsExperience}+` : '10+', label: 'Years Experience' },
            { value: '4.9 / 5', label: 'Average Rating' },
            { value: '3 Hrs',   label: 'Response Time' },
          ].map((stat, i) => (
            <div key={stat.label} className="card stat-card" style={{ animationDelay: `${i * 0.08}s` }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600,
                color: 'var(--color-voltage-violet)', letterSpacing: '-0.6px', marginBottom: 4,
              }}>
                {bootStatus === 'loading'
                  ? <div className="skeleton" style={{ height: 32, borderRadius: 6 }} />
                  : stat.value
                }
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-slate)', fontWeight: 500 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}