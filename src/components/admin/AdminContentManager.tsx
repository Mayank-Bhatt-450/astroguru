// src/components/admin/AdminContentManager.tsx
// FIXES:
// 1. Token fetched at runtime inside save handlers
// 2. Unauthorized clears token
// 3. Shows full API error message

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { bootCache } from '../../lib/cache';
import { adminUpdateContent } from '../../lib/api';

function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  let t = localStorage.getItem('admin_token') || '';
  if (!t) { t = window.prompt('Enter admin token:') || ''; if (t) localStorage.setItem('admin_token', t); }
  return t;
}
function clearAdminToken() { localStorage.removeItem('admin_token'); }

type Section = 'hero' | 'about' | 'faqs' | 'quickconsult' | 'testimonials' | 'pricing';

const SECTIONS: { id: Section; icon: string; label: string }[] = [
  { id: 'hero',         icon: '🏠', label: 'Hero Section' },
  { id: 'about',        icon: '👤', label: 'About' },
  { id: 'faqs',         icon: '❓', label: 'FAQs' },
  { id: 'quickconsult', icon: '⚡', label: 'Quick Consult' },
  { id: 'testimonials', icon: '⭐', label: 'Testimonials' },
  { id: 'pricing',      icon: '💰', label: 'Pricing' },
];

export default function AdminContentManager() {
  const [active,  setActive]  = useState<Section>('hero');
  const [saving,  setSaving]  = useState(false);
  const [result,  setResult]  = useState<{ ok: boolean; msg: string } | null>(null);

  const save = async (sheetName: string, rows: unknown[][]) => {
    const token = getAdminToken();
    if (!token) { setResult({ ok: false, msg: 'Admin token required.' }); return; }
    setSaving(true);
    setResult(null);
    const res = await adminUpdateContent(token, sheetName, rows);
    setSaving(false);
    if (!res.ok) {
      if (res.error?.toLowerCase().includes('unauthorized')) {
        clearAdminToken();
        setResult({ ok: false, msg: 'Invalid admin token. Token cleared — try again.' });
      } else {
        setResult({ ok: false, msg: `Save failed: ${res.error}` });
      }
      return;
    }
    bootCache.invalidate();
    setResult({ ok: true, msg: '✓ Saved. Cache cleared — changes live on next page load.' });
    setTimeout(() => setResult(null), 4000);
  };

  return (
    <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:24, alignItems:'start' }}>

      {/* Section nav */}
      <div style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:16, padding:10 }}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`admin-nav-item ${active === s.id ? 'active' : ''}`}
            style={{ width:'100%', textAlign:'left' }}
            onClick={() => { setActive(s.id); setResult(null); }}
          >
            <span style={{ fontSize:14 }}>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* Editor pane */}
      <div>
        {result && (
          <div className={`banner ${result.ok ? 'banner-success' : 'banner-error'} mb-20`}>
            {result.msg}
          </div>
        )}

        {active === 'hero'         && <HeroEditor       onSave={save} saving={saving} />}
        {active === 'about'        && <AboutEditor      onSave={save} saving={saving} />}
        {active === 'faqs'         && <FaqEditor        onSave={save} saving={saving} />}
        {active === 'quickconsult' && <QuickConsultEditor onSave={save} saving={saving} />}
        {active === 'testimonials' && <TestimonialsNote />}
        {active === 'pricing'      && <PricingNote />}
      </div>
    </div>
  );
}

// ── Shared editor props ────────────────────────────────────
type SaveFn = (sheetName: string, rows: unknown[][]) => void;
interface EP { onSave: SaveFn; saving: boolean; }

function SaveButton({ saving, label = 'Save' }: { saving: boolean; label?: string }) {
  return (
    <div style={{ marginTop:24, paddingTop:20, borderTop:'1px solid var(--color-mist)' }}>
      <button type="submit" className="btn btn-primary" style={{ padding:'10px 28px' }} disabled={saving}>
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );
}

// ── Hero editor ────────────────────────────────────────────
function HeroEditor({ onSave, saving }: EP) {
  const { register, handleSubmit } = useForm({
    defaultValues: { headline: '', subheadline: '', ctaText: '', ctaSubText: '' }
  });
  const submit = (d: Record<string, string>) => onSave('Content_Hero', [
    ['headline',    d.headline],
    ['subheadline', d.subheadline],
    ['ctaText',     d.ctaText],
    ['ctaSubText',  d.ctaSubText],
  ]);
  return (
    <form onSubmit={handleSubmit(submit)} style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:20, padding:28 }}>
      <h4 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:20 }}>Hero Section</h4>
      <div className="form-group mb-16">
        <label className="form-label">Headline</label>
        <input className="form-input" placeholder="Unlock the Secrets of Your Stars" {...register('headline')} />
        <p className="form-hint">Use \n for a line break</p>
      </div>
      <div className="form-group mb-16">
        <label className="form-label">Sub-headline</label>
        <textarea className="form-input" rows={3} placeholder="Book a private 1-on-1 consultation…" {...register('subheadline')} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="form-group">
          <label className="form-label">CTA Button Text</label>
          <input className="form-input" placeholder="Book a Consultation" {...register('ctaText')} />
        </div>
        <div className="form-group">
          <label className="form-label">CTA Sub-text</label>
          <input className="form-input" placeholder="Secure · Private · Instant" {...register('ctaSubText')} />
        </div>
      </div>
      <SaveButton saving={saving} label="Save Hero" />
    </form>
  );
}

// ── About editor ───────────────────────────────────────────
function AboutEditor({ onSave, saving }: EP) {
  const { register, handleSubmit } = useForm({
    defaultValues: { title: '', body: '', yearsExperience: '', clientsServed: '', credentials: '' }
  });
  const submit = (d: Record<string, string>) => onSave('Content_About', [
    ['title',           d.title],
    ['body',            d.body],
    ['yearsExperience', d.yearsExperience],
    ['clientsServed',   d.clientsServed],
    ['credentials',     d.credentials],
  ]);
  return (
    <form onSubmit={handleSubmit(submit)} style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:20, padding:28 }}>
      <h4 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:20 }}>About Section</h4>
      <div className="form-group mb-16">
        <label className="form-label">Section Title</label>
        <input className="form-input" placeholder="About the Practitioner" {...register('title')} />
      </div>
      <div className="form-group mb-16">
        <label className="form-label">Body Text</label>
        <textarea className="form-input" rows={6} placeholder="Your bio…" {...register('body')} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
        <div className="form-group">
          <label className="form-label">Years Experience</label>
          <input type="number" className="form-input" placeholder="10" {...register('yearsExperience')} />
        </div>
        <div className="form-group">
          <label className="form-label">Clients Served</label>
          <input type="number" className="form-input" placeholder="2500" {...register('clientsServed')} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Credentials (comma-separated)</label>
        <input className="form-input" placeholder="Certified Vedic Astrologer, Vastu Expert" {...register('credentials')} />
      </div>
      <SaveButton saving={saving} label="Save About" />
    </form>
  );
}

// ── FAQ editor ─────────────────────────────────────────────
function FaqEditor({ onSave, saving }: EP) {
  const [faqs, setFaqs] = useState([{ q: '', a: '' }]);
  const update = (i: number, field: 'q'|'a', val: string) => {
    const n = [...faqs]; n[i] = { ...n[i], [field]: val }; setFaqs(n);
  };
  const submit = () => onSave('FAQs', faqs.map((f, i) => [i + 1, f.q, f.a]));
  return (
    <div style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:20, padding:28 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h4 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600 }}>FAQs</h4>
        <button type="button" className="btn btn-ghost" style={{ padding:'6px 14px', fontSize:13 }}
          onClick={() => setFaqs([...faqs, { q: '', a: '' }])}>
          + Add FAQ
        </button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {faqs.map((f, i) => (
          <div key={i} style={{ padding:16, background:'var(--color-fog)', borderRadius:12, border:'1px solid var(--color-mist)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--color-slate)' }}>FAQ #{i + 1}</span>
              {faqs.length > 1 && (
                <button type="button" onClick={() => setFaqs(faqs.filter((_,j) => j !== i))}
                  style={{ fontSize:12, color:'#ef4444', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
                  Remove
                </button>
              )}
            </div>
            <div className="form-group mb-10">
              <label className="form-label">Question</label>
              <input className="form-input" value={f.q} onChange={e => update(i, 'q', e.target.value)} placeholder="What is…?" />
            </div>
            <div className="form-group">
              <label className="form-label">Answer</label>
              <textarea className="form-input" rows={2} value={f.a} onChange={e => update(i, 'a', e.target.value)} placeholder="Answer…" />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:24, paddingTop:20, borderTop:'1px solid var(--color-mist)' }}>
        <button type="button" className="btn btn-primary" style={{ padding:'10px 28px' }} disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : 'Save FAQs'}
        </button>
      </div>
    </div>
  );
}

// ── Quick Consult editor ───────────────────────────────────
function QuickConsultEditor({ onSave, saving }: EP) {
  const { register, handleSubmit } = useForm({
    defaultValues: { title: '', description: '', maxQuestions: '3', turnaroundHours: '24', price: '', priceDisplay: '' }
  });
  const submit = (d: Record<string, string>) => onSave('Content_QuickConsult', [
    ['title',           d.title],
    ['description',     d.description],
    ['maxQuestions',    d.maxQuestions],
    ['turnaroundHours', d.turnaroundHours],
    ['price',           d.price],
    ['priceDisplay',    d.priceDisplay],
  ]);
  return (
    <form onSubmit={handleSubmit(submit)} style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:20, padding:28 }}>
      <h4 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:20 }}>Quick Consult</h4>
      <div className="form-group mb-16">
        <label className="form-label">Title</label>
        <input className="form-input" placeholder="Quick Consultation" {...register('title')} />
      </div>
      <div className="form-group mb-16">
        <label className="form-label">Description</label>
        <textarea className="form-input" rows={3} {...register('description')} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:16 }}>
        <div className="form-group">
          <label className="form-label">Max Questions</label>
          <input type="number" min="1" max="5" className="form-input" {...register('maxQuestions')} />
        </div>
        <div className="form-group">
          <label className="form-label">Turnaround (hours)</label>
          <input type="number" min="1" className="form-input" {...register('turnaroundHours')} />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
        <div className="form-group">
          <label className="form-label">Price (paise, e.g. 49900)</label>
          <input type="number" className="form-input" placeholder="49900" {...register('price')} />
        </div>
        <div className="form-group">
          <label className="form-label">Display Price</label>
          <input className="form-input" placeholder="₹499" {...register('priceDisplay')} />
        </div>
      </div>
      <SaveButton saving={saving} label="Save Quick Consult" />
    </form>
  );
}

function TestimonialsNote() {
  return (
    <div style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:20, padding:28 }}>
      <h4 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:16 }}>Testimonials</h4>
      <div className="banner banner-info mb-16">
        Testimonials are managed directly in the <strong>Testimonials</strong> sheet in Google Sheets for easiest bulk editing.
      </div>
      <p style={{ fontSize:14, color:'var(--color-slate)', lineHeight:1.7 }}>
        Columns: <code style={{ background:'var(--color-fog)', padding:'1px 6px', borderRadius:4 }}>id | name | city | service | rating | body | avatarInitials | createdAt</code>
      </p>
      <p style={{ fontSize:14, color:'var(--color-slate)', marginTop:10 }}>
        After editing the sheet, click <strong>Clear Cache</strong> in the top bar to see changes live.
      </p>
    </div>
  );
}

function PricingNote() {
  return (
    <div style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:20, padding:28 }}>
      <h4 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:16 }}>Pricing Tiers</h4>
      <div className="banner banner-info mb-16">
        Pricing tiers are managed directly in the <strong>Pricing</strong> sheet for complex multi-row editing.
      </div>
      <p style={{ fontSize:14, color:'var(--color-slate)', lineHeight:1.7 }}>
        Columns: <code style={{ background:'var(--color-fog)', padding:'1px 6px', borderRadius:4 }}>id | serviceId | label | price | priceDisplay | isPopular | features | ctaText</code>
      </p>
      <p style={{ fontSize:14, color:'var(--color-slate)', marginTop:10 }}>
        The <code style={{ background:'var(--color-fog)', padding:'1px 6px', borderRadius:4 }}>features</code> column must be a JSON array string, e.g.{' '}
        <code style={{ background:'var(--color-fog)', padding:'1px 6px', borderRadius:4 }}>["Feature 1","Feature 2"]</code>
      </p>
      <p style={{ fontSize:14, color:'var(--color-slate)', marginTop:10 }}>
        Prices are in the smallest currency unit (paise for INR): ₹1,500 = <code style={{ background:'var(--color-fog)', padding:'1px 6px', borderRadius:4 }}>150000</code>
      </p>
    </div>
  );
}
