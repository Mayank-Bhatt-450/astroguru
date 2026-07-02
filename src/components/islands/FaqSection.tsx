// src/components/islands/FaqSection.tsx
import { useState, useEffect, useRef } from 'react';
import { useAppStore, selectFaqs } from '../../stores/appStore';

export default function FaqSection() {
  const bootStatus = useAppStore(s => s.bootStatus);
  const faqs       = useAppStore(selectFaqs).sort((a, b) => a.order - b.order);
  const [openId, setOpenId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

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
    <section ref={sectionRef} className="section" id="faqs" style={{ background: 'var(--color-fog)' }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="text-center mb-48 animate-on-scroll">
          <p className="eyebrow mb-12">Have Questions?</p>
          <h2 className="text-heading">Frequently Asked</h2>
          <div className="divider-violet" />
        </div>

        {bootStatus === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 12 }} />)}
          </div>
        )}

        {bootStatus === 'ready' && (
          <div className="animate-on-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {faqs.map(faq => (
              <div
                key={faq.id}
                style={{
                  background: 'var(--color-pure-white)',
                  border: openId === faq.id ? '1px solid var(--color-lavender-mist)' : '1px solid var(--color-mist)',
                  borderRadius: 14, overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}
              >
                <button
                  onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'clamp(12px,3vw,16px) 20px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left', gap: 12,
                  }}
                  aria-expanded={openId === faq.id}
                >
                  <span style={{
                    fontFamily: 'var(--font-body)', fontWeight: 600,
                    fontSize: 'clamp(14px,2vw,15px)',
                    color: openId === faq.id ? 'var(--color-voltage-violet)' : 'var(--color-midnight-ink)',
                    lineHeight: 1.4,
                  }}>
                    {faq.question}
                  </span>
                  <span style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                    background: openId === faq.id ? 'var(--color-voltage-violet)' : 'var(--color-fog)',
                    color: openId === faq.id ? 'white' : 'var(--color-slate)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, transition: 'all 0.2s',
                    transform: openId === faq.id ? 'rotate(45deg)' : 'none',
                  }}>+</span>
                </button>
                {openId === faq.id && (
                  <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--color-mist)' }}>
                    <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--color-graphite)', paddingTop: 14 }}>
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}