// src/components/admin/AdminSettings.tsx
// FIXES:
// 1. Token fetched at runtime inside save handler
// 2. Unauthorized clears token and shows clear message
// 3. Loads current settings from boot cache on mount

import { useState, useEffect } from 'react';
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

type Tab = 'whatsapp' | 'urgency' | 'general';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'whatsapp', icon: '💬', label: 'WhatsApp' },
  { id: 'urgency',  icon: '⚡', label: 'Urgency' },
  { id: 'general',  icon: '⚙️', label: 'General' },
];

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('whatsapp');
  const [saving,    setSaving]    = useState(false);
  const [result,    setResult]    = useState<{ ok: boolean; msg: string } | null>(null);

  const { register, handleSubmit, reset } = useForm();

  // Pre-fill from cache if available
  useEffect(() => {
    const boot = bootCache.get();
    if (!boot) return;
    const c = boot.config;
    reset({
      waEnabled:            String(c.whatsapp.enabled),
      waNumber:             c.whatsapp.number,
      waButtonText:         c.whatsapp.buttonText,
      waPosition:           c.whatsapp.position,
      waMessage:            c.whatsapp.defaultMessage,
      urgencyEnabled:       String(c.urgency.enabled),
      urgencySlotsText:     c.urgency.slotsLeftText,
      urgencyResponseHours: String(c.urgency.responseTimeHours),
      urgencyPromoText:     c.urgency.promoText,
      urgencyCountdown:     c.urgency.countdownEndTime,
      adminEmail:           c.adminEmail,
      timezone:             c.timezone,
      currencyCode:         c.currencyCode,
    });
  }, [reset]);

  const onSave = async (data: Record<string, string>) => {
    const token = getAdminToken();
    if (!token) { setResult({ ok: false, msg: 'Admin token required.' }); return; }

    setSaving(true);
    setResult(null);

    // Build key-value rows for the Config sheet
    const rows: unknown[][] = [
      ['waEnabled',            data.waEnabled === 'true' ? 'true' : 'false'],
      ['waNumber',             data.waNumber || ''],
      ['waButtonText',         data.waButtonText || ''],
      ['waPosition',           data.waPosition || 'bottom-right'],
      ['waMessage',            data.waMessage || ''],
      ['urgencyEnabled',       data.urgencyEnabled === 'true' ? 'true' : 'false'],
      ['urgencySlotsText',     data.urgencySlotsText || ''],
      ['urgencyResponseHours', data.urgencyResponseHours || '3'],
      ['urgencyPromoText',     data.urgencyPromoText || ''],
      ['urgencyCountdown',     data.urgencyCountdown || ''],
      ['adminEmail',           data.adminEmail || ''],
      ['timezone',             data.timezone || 'Asia/Kolkata'],
      ['currencyCode',         data.currencyCode || 'INR'],
    ];

    const res = await adminUpdateContent(token, 'Config', rows);
    setSaving(false);

    if (!res.ok) {
      if (res.error?.toLowerCase().includes('unauthorized')) {
        clearAdminToken();
        setResult({ ok: false, msg: 'Invalid admin token. Token cleared — save again to re-enter.' });
      } else {
        setResult({ ok: false, msg: `Save failed: ${res.error}` });
      }
      return;
    }

    bootCache.invalidate(); // force fresh boot on next load
    setResult({ ok: true, msg: '✓ Settings saved. Site cache cleared — changes live on next page load.' });
    setTimeout(() => setResult(null), 5000);
  };

  return (
    <form onSubmit={handleSubmit(onSave)}>
      {result && (
        <div className={`banner ${result.ok ? 'banner-success' : 'banner-error'} mb-20`}>
          {result.msg}
        </div>
      )}

      {/* Tab nav */}
      <div style={{ display:'flex', gap:8, marginBottom:28 }}>
        {TABS.map(t => (
          <button
            type="button"
            key={t.id}
            className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding:'8px 20px', fontSize:14 }}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:20, padding:28, maxWidth:600 }}>

        {/* WhatsApp */}
        {activeTab === 'whatsapp' && (
          <div>
            <h4 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:20 }}>WhatsApp Button</h4>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid var(--color-mist)', marginBottom:16 }}>
              <div>
                <p style={{ fontWeight:600, fontSize:14 }}>Enable WhatsApp Button</p>
                <p style={{ fontSize:13, color:'var(--color-slate)' }}>Shows a floating chat button on all pages</p>
              </div>
              <label style={{ position:'relative', display:'inline-block', width:44, height:24, cursor:'pointer' }}>
                <input type="checkbox" {...register('waEnabled')} style={{ opacity:0, width:0, height:0 }} />
                <span style={{
                  position:'absolute', inset:0, background:'var(--color-mist)',
                  borderRadius:12, transition:'0.2s',
                }} />
              </label>
            </div>
            {[
              { label:'WhatsApp Number (without +)', name:'waNumber', placeholder:'919876543210', hint:'Include country code e.g. 91 for India' },
              { label:'Button Text', name:'waButtonText', placeholder:'Chat with us' },
            ].map(f => (
              <div className="form-group mb-16" key={f.name}>
                <label className="form-label">{f.label}</label>
                <input className="form-input" placeholder={f.placeholder} {...register(f.name)} />
                {f.hint && <p className="form-hint">{f.hint}</p>}
              </div>
            ))}
            <div className="form-group mb-16">
              <label className="form-label">Button Position</label>
              <select className="form-input" {...register('waPosition')}>
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Pre-filled Message</label>
              <textarea className="form-input" rows={2} placeholder="Hi, I'd like to book a consultation." {...register('waMessage')} />
            </div>
          </div>
        )}

        {/* Urgency */}
        {activeTab === 'urgency' && (
          <div>
            <h4 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:20 }}>Urgency Messaging</h4>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid var(--color-mist)', marginBottom:16 }}>
              <div>
                <p style={{ fontWeight:600, fontSize:14 }}>Enable Urgency Messaging</p>
                <p style={{ fontSize:13, color:'var(--color-slate)' }}>Shows urgency badge in the hero section</p>
              </div>
              <input type="checkbox" {...register('urgencyEnabled')} style={{ width:18, height:18, accentColor:'var(--color-voltage-violet)', cursor:'pointer' }} />
            </div>
            <div className="form-group mb-16">
              <label className="form-label">Promo Badge Text</label>
              <input className="form-input" placeholder="Limited spots this month" {...register('urgencyPromoText')} />
              <p className="form-hint">Shown in the animated badge in the hero section</p>
            </div>
            <div className="form-group mb-16">
              <label className="form-label">Slots-Left Text</label>
              <input className="form-input" placeholder="Only {n} slot(s) left this week" {...register('urgencySlotsText')} />
              <p className="form-hint">Use {'{n}'} as a placeholder for the count</p>
            </div>
            <div className="form-group mb-16">
              <label className="form-label">Response Time (hours)</label>
              <input type="number" min="1" max="72" className="form-input" {...register('urgencyResponseHours')} />
            </div>
            <div className="form-group">
              <label className="form-label">Countdown End Time (UTC)</label>
              <input type="datetime-local" className="form-input" {...register('urgencyCountdown')} />
              <p className="form-hint">Leave blank to disable countdown</p>
            </div>
          </div>
        )}

        {/* General */}
        {activeTab === 'general' && (
          <div>
            <h4 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:20 }}>General Settings</h4>
            <div className="form-group mb-16">
              <label className="form-label">Admin Notification Email</label>
              <input type="email" className="form-input" placeholder="admin@yourdomain.com" {...register('adminEmail')} />
              <p className="form-hint">Receives alerts on new bookings and errors</p>
            </div>
            <div className="form-group mb-16">
              <label className="form-label">Timezone (IANA)</label>
              <input className="form-input" placeholder="Asia/Kolkata" {...register('timezone')} />
              <p className="form-hint">Used for slot display and email timestamps. Examples: Asia/Kolkata, Asia/Dubai, Europe/London</p>
            </div>
            <div className="form-group mb-16">
              <label className="form-label">Currency Code</label>
              <input className="form-input" placeholder="INR" {...register('currencyCode')} />
            </div>
            <div className="banner banner-info">
              ℹ Boot data is cached for 24 hours. Saving settings clears the server cache — changes appear at next page load. You can also use the "Clear Cache" button in the top bar.
            </div>
          </div>
        )}

        <div style={{ marginTop:24, paddingTop:20, borderTop:'1px solid var(--color-mist)' }}>
          <button type="submit" className="btn btn-primary" style={{ padding:'12px 28px' }} disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </form>
  );
}
