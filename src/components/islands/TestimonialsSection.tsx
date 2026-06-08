// src/components/islands/TestimonialsSection.tsx
import { useAppStore, selectTestimonials } from '../../stores/appStore';

export default function TestimonialsSection() {
  const bootStatus   = useAppStore(s => s.bootStatus);
  const testimonials = useAppStore(selectTestimonials);

  return (
    <section className="section" id="testimonials" style={{ background: 'var(--color-pure-white)' }}>
      <div className="container">
        <div className="text-center mb-48">
          <p className="eyebrow mb-12">Testimonials</p>
          <h2 className="text-heading">Loved by Clients</h2>
          <div className="divider-violet" />
        </div>

        {bootStatus === 'loading' && (
          <div className="grid-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="skeleton" style={{ height: 220, borderRadius: 24 }} />
            ))}
          </div>
        )}

        {bootStatus === 'ready' && testimonials.length === 0 && (
          <p className="text-center text-slate">No testimonials yet — be the first!</p>
        )}

        {bootStatus === 'ready' && testimonials.length > 0 && (
          /* Masonry-style 3-column grid — Wall of Love */
          <div style={{ columns: '3', columnGap: 20 }}>
            {testimonials.map(t => (
              <div
                key={t.id}
                className="testimonial-card"
                style={{ breakInside: 'avoid', marginBottom: 20, display: 'block' }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="testimonial-avatar">{t.avatarInitials}</div>
                  <div style={{ flex: 1 }}>
                    <div className="testimonial-name">{t.name}</div>
                    <div className="testimonial-handle">{t.city} · {t.service}</div>
                  </div>
                  <span style={{ fontSize: 16, color: 'var(--color-mist)', cursor: 'default' }}>✕</span>
                </div>

                {/* Stars */}
                <div className="star-row">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} style={{ color: i < t.rating ? '#f59e0b' : 'var(--color-mist)', fontSize: 14 }}>★</span>
                  ))}
                </div>

                {/* Quote */}
                <p className="testimonial-quote">"{t.body}"</p>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        {bootStatus === 'ready' && (
          <div className="text-center mt-40">
            <button className="btn btn-primary" style={{ cursor: 'pointer' }} onClick={() => useAppStore.getState().openServicePicker()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>
              Join {testimonials.length > 0 ? `${(testimonials.length * 400 + 2000).toLocaleString()}+` : '2,500+'} satisfied clients
            </button>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          #testimonials [style*="columns: 3"] { columns: 2 !important; }
        }
        @media (max-width: 560px) {
          #testimonials [style*="columns: 3"] { columns: 1 !important; }
        }
      `}</style>
    </section>
  );
}
