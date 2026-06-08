// src/components/islands/ServicesSection.tsx
// "Book now →" links now call openServicePicker(serviceId)
// so the slot picker opens pre-filtered to that specific service.

import { useAppStore, selectServices } from '../../stores/appStore';

export default function ServicesSection() {
  const bootStatus        = useAppStore(s => s.bootStatus);
  const services          = useAppStore(selectServices).filter(s => s.isActive).sort((a, b) => a.order - b.order);
  const openServicePicker = useAppStore(s => s.openServicePicker);

  return (
    <section className="section" id="services" style={{ background: 'var(--color-fog)' }}>
      <div className="container">
        <div className="text-center mb-48">
          <p className="eyebrow mb-12">What I Offer</p>
          <h2 className="text-heading" style={{ maxWidth: 480, margin: '0 auto' }}>
            Sacred Consultation Services
          </h2>
          <div className="divider-violet" />
        </div>

        {/* Loading */}
        {bootStatus === 'loading' && (
          <div className="grid-3">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton" style={{ height: 280, borderRadius: 24 }} />
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

        {/* Cards */}
        {bootStatus === 'ready' && (
          <div className="grid-3">
            {services.map((svc, i) => (
              <div
                key={svc.id}
                className="card"
                style={{
                  display: 'flex', flexDirection: 'column', gap: 16,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'none';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                }}
              >
                {/* Icon chip */}
                <div style={{
                  width: 52, height: 52, borderRadius: 14, fontSize: 24,
                  background: ['var(--color-lavender-field)','var(--color-mint-wash)','#fce7f3'][i % 3],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {svc.iconEmoji}
                </div>

                <div style={{ flex: 1 }}>
                  <h3 className="text-heading-sm" style={{ fontSize: 18, marginBottom: 8 }}>{svc.name}</h3>
                  <p className="body-sm" style={{ lineHeight: 1.7 }}>{svc.shortDescription}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span className="badge badge-violet" style={{ fontSize: 11 }}>
                    ⏱ {svc.durationMinutes} min
                  </span>
                  {/* KEY CHANGE: calls openServicePicker with this service's id */}
                  <button
                    onClick={() => openServicePicker(svc.id)}
                    style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--color-voltage-violet)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: 0,
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
