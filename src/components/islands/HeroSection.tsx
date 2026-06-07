// src/components/islands/HeroSection.tsx
import { useAppStore, selectContent, selectConfig } from '../../stores/appStore';

export default function HeroSection() {
  const bootStatus = useAppStore(s => s.bootStatus);
  const content    = useAppStore(selectContent);
  const config     = useAppStore(selectConfig);
  const hero       = content?.hero;

  return (
    <section
      className="section-lg orb-container"
      style={{ position: 'relative', background: 'var(--color-pure-white)', overflow: 'hidden', paddingTop: '96px', paddingBottom: '96px' }}
    >
      {/* Gradient orbs — behind content, per Supahub spec */}
      <div className="orb orb-violet" style={{ width: 600, height: 600, top: -120, left: -100, opacity: 0.7 }} />
      <div className="orb orb-pink"   style={{ width: 500, height: 500, top: 0,    right: -80, opacity: 0.6 }} />
      <div className="orb orb-amber"  style={{ width: 400, height: 400, bottom: -60, left: '40%', opacity: 0.4 }} />

      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        {/* Eyebrow */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <span className="badge badge-violet" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="pulse-dot" />
            {config?.urgency?.enabled ? config.urgency.promoText : 'Live Consultations Available'}
          </span>
        </div>

        {/* Headline */}
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
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
                  .replace('\n', '<br/>')
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
              {hero?.subheadline || 'Book a private 1-on-1 consultation for astrology, numerology, or Vastu Shastra. Personalised insights from an expert Vedic practitioner.'}
            </p>
          )}
        </div>

        {/* CTA row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
          <a href="#book" className="btn btn-primary" style={{ fontSize: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>
            {hero?.ctaText || 'Book a Consultation'}
          </a>
          <a href="/quick-consult" className="btn btn-ghost" style={{ fontSize: 16 }}>
            ⚡ Quick Consult
          </a>
        </div>

        {/* Social proof */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div className="avatar-stack">
            {['PS','RV','AN','KM'].map((initials, i) => (
              <div key={i} className="avatar-stack-item" style={{ background: ['#ebdafd','#d6fcf4','#fce7f3','#dbeafe'][i] }}>
                {initials}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="star-row">{'★★★★★'.split('').map((s,i)=><span key={i} className="star">{s}</span>)}</span>
            <span className="social-proof-text">
              loved by {content?.about?.clientsServed ? `${(content.about.clientsServed as number).toLocaleString()}+` : '2,500+'} clients
            </span>
          </div>
        </div>

        {/* Floating stat cards */}
        <div style={{ marginTop: 80, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, maxWidth: 800, margin: '80px auto 0' }}>
          {[
            { value: `${content?.about?.clientsServed ? `${content.about.clientsServed}+` : '2,500+'}`, label: 'Lives Guided' },
            { value: `${content?.about?.yearsExperience ? `${content.about.yearsExperience}+` : '10+'}`, label: 'Years Experience' },
            { value: '4.9 / 5', label: 'Average Rating' },
            { value: '3 Hrs', label: 'Response Time' },
          ].map(stat => (
            <div
              key={stat.label}
              className="card"
              style={{ textAlign: 'center', padding: '20px 16px', boxShadow: 'var(--shadow-card)' }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, color: 'var(--color-voltage-violet)', letterSpacing: '-0.6px', marginBottom: 4 }}>
                {bootStatus === 'loading' ? <div className="skeleton" style={{ height: 32, borderRadius: 6 }} /> : stat.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-slate)', fontWeight: 500 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
