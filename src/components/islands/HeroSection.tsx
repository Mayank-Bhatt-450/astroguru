// src/components/islands/HeroSection.tsx
// ============================================================
// Hero section with a meaningful Vedic constellation background
// animation. The canvas draws slowly-drifting stars connected by
// subtle lines — evoking a birth-chart / star-map feel.
// Content always sits above the canvas (z-index: 1 via hero-content-wrap).
// ============================================================

import { useEffect, useRef } from 'react';
import { useAppStore, selectContent, selectConfig } from '../../stores/appStore';

// ── Constellation canvas ─────────────────────────────────
function ConstellationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let W = 0, H = 0;

    // Zodiac glyphs positioned at fixed relative coords
    const ZODIAC = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];

    interface Star {
      x: number; y: number;
      vx: number; vy: number;
      r: number; opacity: number;
      twinkleSpeed: number; twinkleOffset: number;
    }

    let stars: Star[] = [];

    const resize = () => {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width  = W;
      canvas.height = H;
      initStars();
    };

    const initStars = () => {
      const count = Math.max(30, Math.floor((W * H) / 14000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.10,
        r:  Math.random() * 1.6 + 0.5,
        opacity: Math.random() * 0.5 + 0.3,
        twinkleSpeed:  Math.random() * 0.02 + 0.008,
        twinkleOffset: Math.random() * Math.PI * 2,
      }));
    };

    let t = 0;
    const CONNECT_DIST = Math.min(140, W * 0.15);
    const LINE_COLOR   = '124,58,237';  // violet

    const draw = () => {
      t += 0.5;
      ctx.clearRect(0, 0, W, H);

      // ── Gradient background tint ──────────────────────────
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, 'rgba(240,235,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // ── Update star positions ─────────────────────────────
      for (const s of stars) {
        s.x += s.vx; s.y += s.vy;
        if (s.x < -10) s.x = W + 10;
        if (s.x > W+10) s.x = -10;
        if (s.y < -10) s.y = H + 10;
        if (s.y > H+10) s.y = -10;
      }

      // ── Draw connecting lines (constellation edges) ───────
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const d  = Math.sqrt(dx*dx + dy*dy);
          if (d > CONNECT_DIST) continue;
          const alpha = (1 - d / CONNECT_DIST) * 0.18;
          ctx.beginPath();
          ctx.moveTo(stars[i].x, stars[i].y);
          ctx.lineTo(stars[j].x, stars[j].y);
          ctx.strokeStyle = `rgba(${LINE_COLOR},${alpha})`;
          ctx.lineWidth   = 0.7;
          ctx.stroke();
        }
      }

      // ── Draw stars ────────────────────────────────────────
      for (const s of stars) {
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinkleOffset);
        const opacity = s.opacity * (0.6 + 0.4 * twinkle);
        const radius  = s.r * (0.85 + 0.15 * twinkle);

        // Glow halo
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius * 4);
        glow.addColorStop(0, `rgba(${LINE_COLOR},${opacity * 0.35})`);
        glow.addColorStop(1, `rgba(${LINE_COLOR},0)`);
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius * 4, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${LINE_COLOR},${opacity})`;
        ctx.fill();
      }

      // ── Subtle zodiac glyphs at corners ───────────────────
      if (W > 600) {
        const glyphPositions = [
          { x: W * 0.06, y: H * 0.12 },
          { x: W * 0.94, y: H * 0.08 },
          { x: W * 0.04, y: H * 0.88 },
          { x: W * 0.92, y: H * 0.82 },
        ];
        const glyphs = [ZODIAC[0], ZODIAC[3], ZODIAC[6], ZODIAC[9]];
        glyphs.forEach((g, i) => {
          const pos = glyphPositions[i];
          const drift = Math.sin(t * 0.012 + i * 1.5) * 6;
          ctx.font = `${Math.min(36, W * 0.035)}px serif`;
          ctx.fillStyle = `rgba(${LINE_COLOR},0.09)`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(g, pos.x, pos.y + drift);
        });
      }

      animId = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}

// ── Main HeroSection ─────────────────────────────────────
export default function HeroSection() {
  const bootStatus        = useAppStore(s => s.bootStatus);
  const content           = useAppStore(selectContent);
  const config            = useAppStore(selectConfig);
  const openServicePicker = useAppStore(s => s.openServicePicker);
  const sectionRef        = useRef<HTMLElement>(null);
  const hero              = content?.hero;

  const urgencyText =
    bootStatus === 'ready' && config?.urgency?.enabled && config.urgency.promoText
      ? config.urgency.promoText
      : 'Live Consultations Available';

  // Staggered entrance animation
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const children = el.querySelectorAll<HTMLElement>('[data-animate]');
    children.forEach((child, i) => {
      child.style.opacity   = '0';
      child.style.transform = 'translateY(24px)';
      setTimeout(() => {
        child.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        child.style.opacity    = '1';
        child.style.transform  = 'translateY(0)';
      }, 120 + i * 110);
    });
  }, [bootStatus]);

  return (
    <section
      ref={sectionRef}
      aria-label="Welcome — AstroGuru Vedic Consultations"
      style={{
        position: 'relative',
        background: 'var(--color-pure-white)',
        overflow: 'hidden',
        paddingTop: 96,
        paddingBottom: 96,
      }}
    >
      {/* ── Constellation canvas (purely decorative, behind content) ── */}
      <ConstellationCanvas />

      {/* ── Soft gradient orbs under canvas ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', width: 560, height: 560,
          top: -100, left: -80,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(196,181,253,0.45), rgba(139,92,246,0.15))',
          filter: 'blur(72px)',
          animation: 'orb-drift 14s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 440, height: 440,
          top: -20, right: -60,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(251,207,232,0.35), rgba(244,114,182,0.1))',
          filter: 'blur(72px)',
          animation: 'orb-drift-slow 20s ease-in-out infinite',
        }} />
      </div>

      {/* ── All hero content — always above canvas (z-index:1) ── */}
      <div className="hero-content-wrap container">

        {/* Urgency badge */}
        <div data-animate style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <span className="badge badge-violet" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
                __html: (hero?.headline || '\n\n')
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
                '\n\n'}
            </p>
          )}
        </div>

        {/* CTAs */}
        <div data-animate style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
          <button
            className="btn btn-primary btn-hero-pulse"
            style={{ fontSize: 16 }}
            onClick={() => openServicePicker()}
            aria-label="Book a consultation session"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
          <div className="avatar-stack" aria-hidden="true">
            {['PS','RV','AN','KM'].map((initials, i) => (
              <div key={i} className="avatar-stack-item" style={{ background: ['#ebdafd','#d6fcf4','#fce7f3','#dbeafe'][i] }}>
                {initials}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="star-row" aria-label="5 star rating">
              {'★★★★★'.split('').map((s, i) => <span key={i} className="star" aria-hidden="true">{s}</span>)}
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