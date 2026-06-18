// src/components/admin/AdminSettings.tsx
// FIXES:
// 1. Token fetched at runtime inside save handler
// 2. Unauthorized clears token and shows clear message
// 3. Loads current settings from boot cache on mount

import { useState, useEffect } from 'react';
import type { UseFormRegister } from 'react-hook-form';

// ── ToggleSwitch ──────────────────────────────────────────
// Renders a styled toggle. react-hook-form registers it as
// a checkbox — checked=true means the feature is enabled.
// We use NO value prop so react-hook-form gives us true/false booleans.
function ToggleSwitch({
  name, register,
}: {
  name: string;
  register: UseFormRegister<Record<string, unknown>>;
}) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer', flexShrink: 0 }}>
      <input
        type="checkbox"
        {...register(name)}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <span style={{
        position: 'absolute', inset: 0,
        background: 'var(--color-mist)',
        borderRadius: 12,
        transition: 'background 0.2s',
      }} />
      <style>{`
        input:checked + span { background: var(--color-voltage-violet) !important; }
        input:checked + span + span { transform: translateX(20px) !important; }
      `}</style>
      <span style={{
        position: 'absolute', top: 2, left: 2,
        width: 20, height: 20, borderRadius: '50%',
        background: 'white',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        transition: 'transform 0.2s',
      }} />
    </label>
  );
}

import { useForm } from 'react-hook-form';
import { bootCache } from '../../lib/cache';
import { adminUpdateContent, adminFixConfigBooleans } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';

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

  const reloadBoot = useAppStore(s => s.reloadBoot);
  const { register, handleSubmit, reset } = useForm();

  // Pre-fill from cache if available
  useEffect(() => {
    const boot = bootCache.get();
    if (!boot) return;
    const c = boot.config;
    // Checkboxes need boolean values (not strings) for react-hook-form
    // String → boolean coercion handles stale cache with string 'true'/'false'
    const toBool = (v: unknown) => v === true || v === 'true' || v === '1';
    reset({
      waEnabled:            toBool(c.whatsapp.enabled),
      waNumber:             c.whatsapp.number      || '',
      waButtonText:         c.whatsapp.buttonText  || '',
      waPosition:           c.whatsapp.position    || 'bottom-right',
      waMessage:            c.whatsapp.defaultMessage || '',
      urgencyEnabled:       toBool(c.urgency.enabled),
      urgencySlotsText:     c.urgency.slotsLeftText || '',
      urgencyResponseHours: String(c.urgency.responseTimeHours || '3'),
      urgencyPromoText:     c.urgency.promoText     || '',
      urgencyCountdown:     c.urgency.countdownEndTime || '',
      adminEmail:           c.adminEmail   || '',
      timezone:             c.timezone     || 'Asia/Kolkata',
      currencyCode:         c.currencyCode || 'INR',
    });
  }, [reset]);

  const onSave = async (data: Record<string, string>) => {
    if (import.meta.env.DEV) console.log('[AdminSettings] Save triggered with data:', data);
    
    const token = getAdminToken();
    if (!token) { setResult({ ok: false, msg: 'Admin token required.' }); return; }

    setSaving(true);
    setResult(null);

    // Build key-value rows for the Config sheet
    // checkboxes give boolean true/false; === true covers both boolean true
    // and string 'true' for backward compat
    const boolStr = (v: unknown) => (v === true || v === 'true') ? 'true' : 'false';
    const rows: unknown[][] = [
      ['waEnabled',            boolStr(data.waEnabled)],
      ['waNumber',             data.waNumber || ''],
      ['waButtonText',         data.waButtonText || ''],
      ['waPosition',           data.waPosition || 'bottom-right'],
      ['waMessage',            data.waMessage || ''],
      ['urgencyEnabled',       boolStr(data.urgencyEnabled)],
      ['urgencySlotsText',     data.urgencySlotsText || ''],
      ['urgencyResponseHours', data.urgencyResponseHours || '3'],
      ['urgencyPromoText',     data.urgencyPromoText || ''],
      ['urgencyCountdown',     data.urgencyCountdown || ''],
      ['adminEmail',           data.adminEmail || ''],
      ['timezone',             data.timezone || 'Asia/Kolkata'],
      ['currencyCode',         data.currencyCode || 'INR'],
    ];

    if (import.meta.env.DEV) console.log('[AdminSettings] Sending rows to backend:', rows);

    const res = await adminUpdateContent(token, 'Config', rows);
    setSaving(false);

    if (!res.ok) {
      if (import.meta.env.DEV) console.error('[AdminSettings] Save failed:', res.error);
      if (res.error?.toLowerCase().includes('unauthorized')) {
        clearAdminToken();
        setResult({ ok: false, msg: 'Invalid admin token. Token cleared — save again to re-enter.' });
      } else {
        setResult({ ok: false, msg: `Save failed: ${res.error}` });
      }
      return;
    }

    if (import.meta.env.DEV) console.log('[AdminSettings] Save successful, reloading boot...');
    bootCache.invalidate(); // clear stale cache
    await reloadBoot(); // fetch fresh config immediately
    
    // Verify the config was actually updated in the store
    const newBoot = bootCache.get();
    if (import.meta.env.DEV && newBoot) {
      console.log('[AdminSettings] Post-reload verification - config:', {
        whatsapp: newBoot.config?.whatsapp,
        urgency: newBoot.config?.urgency
      });
    }
    
    setResult({ ok: true, msg: '✓ Settings saved and applied instantly.' });
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
  <ToggleSwitch name="waEnabled" register={register} />
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
              <ToggleSwitch name="urgencyEnabled" register={register} />
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

        {/* Debug Panel */}
        <div style={{ marginTop:24, padding:16, background:'#f5f5f5', borderRadius:8, fontSize:12, fontFamily:'monospace' }}>
          <h5 style={{ marginBottom:12, fontWeight:600 }}>🔍 Debug: Current Config State</h5>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            <div>
              <strong>WhatsApp:</strong>
              <pre style={{ marginTop:4, whiteSpace:'pre-wrap' }}>{JSON.stringify(bootCache.get()?.config?.whatsapp || 'not loaded', null, 2)}</pre>
            </div>
            <div>
              <strong>Urgency:</strong>
              <pre style={{ marginTop:4, whiteSpace:'pre-wrap' }}>{JSON.stringify(bootCache.get()?.config?.urgency || 'not loaded', null, 2)}</pre>
            </div>
          </div>
          <div style={{ marginTop:12, display:'flex', gap:8 }}>
            <button type="button" className="btn btn-ghost" style={{ padding:'6px 12px', fontSize:12 }} onClick={() => { bootCache.invalidate(); reloadBoot(); }}>
              🔄 Force Reload Config
            </button>
            <button type="button" className="btn btn-ghost" style={{ padding:'6px 12px', fontSize:12 }} onClick={() => { console.log('Current boot cache:', bootCache.get()); }}>
              📋 Log Cache to Console
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding:'6px 12px', fontSize:12, borderColor:'#f59e0b', color:'#92400e', background:'#fef3c7' }}
              onClick={async () => {
                const token = getAdminToken();
                if (!token) return;
                const res = await adminFixConfigBooleans(token);
                if (res.ok) {
                  alert('✓ Fixed ' + res.data.fixed + ' boolean cell(s) in Config sheet. Reloading boot data...');
                  bootCache.invalidate();
                  await reloadBoot();
                  setResult({ ok: true, msg: '✓ Config sheet repaired and settings reloaded.' });
                } else {
                  alert('Fix failed: ' + res.error);
                }
              }}
            >
              🔧 Fix Boolean Cells (Run Once)
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
