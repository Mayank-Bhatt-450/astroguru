// src/components/islands/PricingSection.tsx
import { useState } from 'react';
import { useAppStore, selectPricing, selectServices } from '../../stores/appStore';

export default function PricingSection() {
  const bootStatus        = useAppStore(s => s.bootStatus);
  const pricing           = useAppStore(selectPricing);
  const services          = useAppStore(selectServices).filter(s => s.isActive);
  const openServicePicker = useAppStore(s => s.openServicePicker);
  const [activeId, setActiveId] = useState<string | null>(null);

  const displayId      = activeId ?? services[0]?.id ?? null;
  const displayPricing = displayId ? pricing.filter(p => p.serviceId === displayId) : pricing;

  return (
    <section className="section" id="pricing" style={{ background: 'var(--color-lavender-field)' }}>
      <div className="container">
        <div className="text-center mb-48 animate-on-scroll">
          <p className="eyebrow eyebrow-dark mb-12">Transparent Pricing</p>
          <h2 className="text-heading">Investment in Your Journey</h2>
          <div className="divider-violet" />
        </div>

        {/* Service tabs */}
        {bootStatus === 'ready' && services.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 36, flexWrap: 'wrap' }}>
            {services.map(svc => (
              <button
                key={svc.id}
                className={`btn ${displayId === svc.id ? 'btn-dark' : 'btn-ghost'}`}
                style={{ padding: '8px 20px', fontSize: 14 }}
                onClick={() => setActiveId(svc.id)}
              >
                {svc.iconEmoji} {svc.name}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {bootStatus === 'loading' && (
          <div className="grid-3">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton" style={{ height: 380, borderRadius: 24 }} />
            ))}
          </div>
        )}

        {/* Error */}
        {bootStatus === 'error' && (
          <div className="banner banner-error" style={{ maxWidth: 480, margin: '0 auto' }}>
            Could not load pricing. Please refresh.
          </div>
        )}

        {/* Pricing cards */}
        {bootStatus === 'ready' && (
          <div className="pricing-grid animate-on-scroll" style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(displayPricing.length, 3)}, 1fr)`,
            gap: 20, maxWidth: 900, margin: '0 auto',
          }}>
            {displayPricing.map((tier, i) => (
              <div
                key={tier.id}
                style={{
                  position: 'relative',
                  background: tier.isPopular ? 'var(--color-midnight-ink)' : 'var(--color-pure-white)',
                  border: tier.isPopular ? 'none' : '1px solid var(--color-mist)',
                  borderRadius: 24, padding: 'clamp(20px,4vw,28px)',
                  display: 'flex', flexDirection: 'column', gap: 20,
                  boxShadow: tier.isPopular ? '0 24px 60px rgba(17,24,39,0.25)' : 'none',
                  transform: tier.isPopular ? 'scale(1.02)' : 'none',
                  animationDelay: `${i * 0.08}s`,
                }}
              >
                {tier.isPopular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--color-voltage-violet)', color: 'white',
                    padding: '4px 16px', borderRadius: 9999,
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    ✦ Most Popular
                  </div>
                )}

                <div>
                  <h3 style={{
                    fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 12,
                    color: tier.isPopular ? 'white' : 'var(--color-midnight-ink)',
                  }}>
                    {tier.label}
                  </h3>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 600,
                    letterSpacing: '-0.8px', lineHeight: 1,
                    color: tier.isPopular ? 'white' : 'var(--color-voltage-violet)',
                  }}>
                    {tier.priceDisplay}
                  </div>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(tier.features as string[]).map((f, fi) => (
                    <li key={fi} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14,
                      color: tier.isPopular ? 'rgba(255,255,255,0.8)' : 'var(--color-graphite)',
                    }}>
                      <span style={{
                        color: tier.isPopular ? 'var(--color-lavender-mist)' : 'var(--color-voltage-violet)',
                        fontWeight: 700, marginTop: 1, flexShrink: 0,
                      }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  className={`btn ${tier.isPopular ? 'btn-primary' : 'btn-dark'}`}
                  style={{ justifyContent: 'center', fontSize: 15 }}
                  onClick={() => openServicePicker(tier.serviceId)}
                >
                  {tier.ctaText}
                </button>
              </div>
            ))}
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 32, fontSize: 14, color: 'var(--color-graphite)' }}>
          Not ready for a full session?{' '}
          <a href="/quick-consult" style={{ color: 'var(--color-voltage-violet)', fontWeight: 600 }}>
            Try a Quick Consultation →
          </a>
        </p>
      </div>
    </section>
  );
}