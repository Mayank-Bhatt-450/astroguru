// src/components/islands/ServicesSection.tsx
import { useEffect, useRef } from 'react';
import { useAppStore, selectServices } from '../../stores/appStore';

export default function ServicesSection() {
  const bootStatus        = useAppStore(s => s.bootStatus);
  const services          = useAppStore(selectServices).filter(s => s.isActive).sort((a, b) => a.order - b.order);
  const openServicePicker = useAppStore(s => s.openServicePicker);
  const sectionRef        = useRef<HTMLElement>(null);

  // Re-observe animate-on-scroll elements every time boot data arrives.
  // Without this, cards injected after the initial IntersectionObserver run
  // are never seen by the observer and stay at opacity:0 forever.
  useEffect(() => {
    if (bootStatus !== 'ready') return;
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
    );

    // Small delay so React has flushed the DOM before we query
    const t = setTimeout(() => {
      el.querySelectorAll('.animate-on-scroll').forEach(node => {
        // If already visible (scrolled past on a slow load), show immediately
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight) {
          node.classList.add('visible');
        } else {
          observer.observe(node);
        }
      });
    }, 50);

    return () => { clearTimeout(t); observer.disconnect(); };
  }, [bootStatus]);

  return (
    <section ref={sectionRef} className="section" id="services" style={{ background: 'var(--color-fog)' }}>
      <div className="container">
        <div className="text-center mb-48 animate-on-scroll">
          <p className="eyebrow mb-12">What I Offer</p>
          <h2 className="text-heading" style={{ maxWidth: 480, margin: '0 auto' }}>
            Sacred Consultation Services
          </h2>
          <div className="divider-violet" />
        </div>

        {/* Loading skeletons */}
        {bootStatus === 'loading' && (
          <div className="services-grid">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton" style={{ height: 240, borderRadius: 24 }} />
            ))}
          </div>
        )}

        {/* Error */}
        {bootStatus === 'error' && (
          <div className="banner banner-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Could not load services.{' '}
            <button
              onClick={() => window.location.reload()}
              style={{ marginLeft: 8, fontWeight: 600, color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Cards — animate-on-scroll re-observed via useEffect above */}
        {bootStatus === 'ready' && (
          <div className="services-grid">
            {services.map((svc, i) => (
              <div
                key={svc.id}
                className="card service-card animate-on-scroll"
                style={{
                  display: 'flex', flexDirection: 'column', gap: 16,
                  transitionDelay: `${i * 0.08}s`,
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 14, fontSize: 24,
                  background: ['var(--color-lavender-field)','var(--color-mint-wash)','#fce7f3'][i % 3],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {svc.iconEmoji}
                </div>

                <div style={{ flex: 1 }}>
                  <h3 className="text-heading-sm" style={{ fontSize: 18, marginBottom: 8 }}>{svc.name}</h3>
                  <p className="body-sm" style={{ lineHeight: 1.7 }}>{svc.shortDescription}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    onClick={() => openServicePicker(svc.id)}
                    style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--color-voltage-violet)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4, padding: 0,
                    }}
                  >
                    Book now →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}