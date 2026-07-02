// src/components/islands/TestimonialsSection.tsx
import { useEffect, useRef } from 'react';
import { useAppStore, selectTestimonials } from '../../stores/appStore';

export default function TestimonialsSection() {
  const bootStatus   = useAppStore(s => s.bootStatus);
  const testimonials = useAppStore(selectTestimonials);
  const sectionRef   = useRef<HTMLElement>(null);

  useEffect(() => {
    if (bootStatus !== 'ready') return;
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
      }),
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
    );
    const t = setTimeout(() => {
      el.querySelectorAll('.animate-on-scroll').forEach(node => {
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight) node.classList.add('visible');
        else observer.observe(node);
      });
    }, 50);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [bootStatus]);

  return (
    <section ref={sectionRef} className="section" id="testimonials" style={{ background: 'var(--color-pure-white)' }}>
      <div className="container">
        <div className="text-center mb-48 animate-on-scroll">
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
          <p className="text-center" style={{ color: 'var(--color-slate)' }}>No testimonials yet — be the first!</p>
        )}

        {bootStatus === 'ready' && testimonials.length > 0 && (
          <div className="testimonials-masonry animate-on-scroll" style={{ columns: 3, columnGap: 20 }}>
            {testimonials.map(t => (
              <div key={t.id} className="testimonial-card" style={{ breakInside: 'avoid', marginBottom: 20, display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="testimonial-avatar">{t.avatarInitials}</div>
                  <div style={{ flex: 1 }}>
                    <div className="testimonial-name">{t.name}</div>
                    <div className="testimonial-handle">{t.city} · {t.service}</div>
                  </div>
                </div>
                <div className="star-row" style={{ marginTop: 8 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} style={{ color: i < t.rating ? '#f59e0b' : 'var(--color-mist)', fontSize: 14 }}>★</span>
                  ))}
                </div>
                <p className="testimonial-quote">"{t.body}"</p>
              </div>
            ))}
          </div>
        )}

        {bootStatus === 'ready' && (
          <div className="text-center mt-40">
            <button className="btn btn-primary" onClick={() => useAppStore.getState().openServicePicker()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/>
              </svg>
              Join {testimonials.length > 0 ? `${(testimonials.length * 400 + 2000).toLocaleString()}+` : '2,500+'} satisfied clients
            </button>
          </div>
        )}
      </div>
    </section>
  );
}