// src/components/islands/FaqSection.tsx
import { useState } from 'react';
import { useAppStore, selectFaqs } from '../../stores/appStore';

export default function FaqSection() {
  const bootStatus = useAppStore(s => s.bootStatus);
  const faqs       = useAppStore(selectFaqs).sort((a,b) => a.order - b.order);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="section" id="faqs" style={{ background: 'var(--color-fog)' }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="text-center mb-48">
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {faqs.map(faq => (
              <div
                key={faq.id}
                style={{
                  background: 'var(--color-pure-white)',
                  border: openId === faq.id ? '1px solid var(--color-lavender-mist)' : '1px solid var(--color-mist)',
                  borderRadius: 14,
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}
              >
                <button
                  onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left', gap: 12,
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15,
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
                    <p style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--color-graphite)', paddingTop: 14 }}>
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bottom CTA */}
        <div style={{ marginTop: 48, padding: 28, background: 'var(--color-lavender-field)', borderRadius: 20, textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Still have questions?
          </p>
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginBottom: 20 }}>
            I'm happy to answer any queries before you book.
          </p>
          <a href="#book" className="btn btn-primary" style={{ fontSize: 15 }}>
            Book a Free Intro Call
          </a>
        </div>
      </div>
    </section>
  );
}
