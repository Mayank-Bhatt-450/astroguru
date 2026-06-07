// src/components/admin/AdminSlotManager.tsx
// FIXES:
// 1. Admin token fetched inside event handlers (not at module load time)
//    so localStorage is always available.
// 2. weekdays validation: checked before submit, shown as inline error.
// 3. Full error message from API shown in UI — no silent failures.
// 4. loadSlots error shown in table area.
// 5. Form reset after close resets day selection too.

import { useState, useEffect, useCallback } from 'react';
import { adminCreateSlots, adminToggleSlot, adminDeleteSlot, fetchSlots } from '../../lib/api';
import { slotsCache } from '../../lib/cache';
import type { Slot, SlotTemplate } from '../../lib/types';

// ── Token helper — ALWAYS called at runtime, never at module init ──
function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  let t = localStorage.getItem('admin_token') || '';
  if (!t) {
    t = window.prompt('Enter your admin token (set as ADMIN_SECRET in GAS Script Properties):') || '';
    if (t) localStorage.setItem('admin_token', t);
  }
  return t;
}

function clearAdminToken() {
  localStorage.removeItem('admin_token');
}

const DAYS = [
  { v: 0, l: 'Sun' }, { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' },
  { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' },
];

const STATUS_CHIP: Record<string, { bg: string; color: string }> = {
  available: { bg: '#d1fae5', color: '#065f46' },
  booked:    { bg: '#fee2e2', color: '#991b1b' },
  locked:    { bg: '#fef3c7', color: '#92400e' },
  disabled:  { bg: '#f3f4f6', color: '#6b7280' },
};

interface Props { services: { id: string; name: string; iconEmoji: string }[]; }

// ── Form state ─────────────────────────────────────────────
interface SlotForm {
  serviceId:       string;
  startDate:       string;
  endDate:         string;
  startTime:       string;
  durationMinutes: number;
}

const DEFAULT_FORM: SlotForm = {
  serviceId:       '',
  startDate:       '',
  endDate:         '',
  startTime:       '',
  durationMinutes: 60,
};

export default function AdminSlotManager({ services }: Props) {
  const [slots,        setSlots]        = useState<Slot[]>([]);
  const [slotsStatus,  setSlotsStatus]  = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [slotsError,   setSlotsError]   = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState<SlotForm>({ ...DEFAULT_FORM, serviceId: services[0]?.id || '' });
  const [selectedDays, setSelectedDays] = useState<number[]>([1,2,3,4,5]);
  const [formErrors,   setFormErrors]   = useState<Partial<Record<keyof SlotForm | 'weekdays', string>>>({});
  const [creating,     setCreating]     = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [filterSvcId,  setFilterSvcId]  = useState(services[0]?.id || '');

  // ── Load slots ────────────────────────────────────────────
  const loadSlots = useCallback(async (svcId: string) => {
    setSlotsStatus('loading');
    setSlotsError('');
    const today = new Date().toISOString().split('T')[0];
    const res   = await fetchSlots(svcId, today, 30);
    if (!res.ok) {
      setSlotsStatus('error');
      setSlotsError(res.error);
      return;
    }
    // Sort by start time ascending
    const sorted = [...res.data].sort((a, b) =>
      new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
    );
    setSlots(sorted);
    setSlotsStatus('ready');
  }, []);

  useEffect(() => {
    if (filterSvcId) loadSlots(filterSvcId);
  }, [filterSvcId, loadSlots]);

  // ── Form helpers ──────────────────────────────────────────
  const setField = (field: keyof SlotForm, value: string | number) => {
    setForm(f => ({ ...f, [field]: value }));
    setFormErrors(e => ({ ...e, [field]: '' }));
  };

  const toggleDay = (d: number) => {
    setSelectedDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );
    setFormErrors(e => ({ ...e, weekdays: '' }));
  };

  const validateForm = (): boolean => {
    const errs: typeof formErrors = {};
    if (!form.serviceId)   errs.serviceId = 'Select a service';
    if (!form.startDate)   errs.startDate = 'Required';
    if (!form.endDate)     errs.endDate   = 'Required';
    if (!form.startTime)   errs.startTime = 'Required';
    if (form.durationMinutes < 15 || form.durationMinutes > 240)
      errs.durationMinutes = 'Between 15 and 240 minutes';
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      errs.endDate = 'Must be on or after start date';
    if (selectedDays.length === 0)
      errs.weekdays = 'Select at least one day';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Create slots ──────────────────────────────────────────
  const handleCreate = async () => {
    if (!validateForm()) return;

    const token = getAdminToken();
    if (!token) {
      setCreateResult({ ok: false, msg: 'Admin token is required. Set ADMIN_SECRET in GAS Script Properties.' });
      return;
    }

    setCreating(true);
    setCreateResult(null);

    const template: SlotTemplate = {
      serviceId:       form.serviceId,
      startDate:       form.startDate,
      endDate:         form.endDate,
      startTime:       form.startTime,
      durationMinutes: form.durationMinutes,
      weekdays:        selectedDays,
    };

    const res = await adminCreateSlots(token, template);

    setCreating(false);

    if (!res.ok) {
      // If unauthorized, clear cached token so user is re-prompted next time
      if (res.error?.toLowerCase().includes('unauthorized')) {
        clearAdminToken();
        setCreateResult({ ok: false, msg: 'Invalid admin token. Token cleared — try again.' });
      } else {
        setCreateResult({ ok: false, msg: `Error: ${res.error}` });
      }
      return;
    }

    const count = res.data.created;
    setCreateResult({ ok: true, msg: `✓ Created ${count} slot${count !== 1 ? 's' : ''} successfully!` });
    slotsCache.invalidateAll();

    // Reset form but keep modal open to show success
    setForm({ ...DEFAULT_FORM, serviceId: form.serviceId });
    setSelectedDays([1,2,3,4,5]);

    // Reload table and close modal after short delay
    await loadSlots(filterSvcId);
    setTimeout(() => {
      setShowModal(false);
      setCreateResult(null);
    }, 2200);
  };

  // ── Toggle enable/disable ─────────────────────────────────
  const handleToggle = async (slot: Slot) => {
    const token = getAdminToken();
    if (!token) return;
    const enabling = slot.status === 'disabled';
    const res = await adminToggleSlot(token, slot.id, enabling);
    if (!res.ok) {
      if (res.error?.toLowerCase().includes('unauthorized')) clearAdminToken();
      alert(`Failed to ${enabling ? 'enable' : 'disable'} slot: ${res.error}`);
      return;
    }
    slotsCache.invalidateAll();
    loadSlots(filterSvcId);
  };

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = async (slot: Slot) => {
    if (slot.status === 'booked') { alert('Cannot delete a booked slot.'); return; }
    if (!window.confirm(`Delete slot on ${new Date(slot.startUtc).toLocaleString('en-IN', { timeZone:'UTC', weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })} UTC?`)) return;
    const token = getAdminToken();
    if (!token) return;
    const res = await adminDeleteSlot(token, slot.id);
    if (!res.ok) {
      if (res.error?.toLowerCase().includes('unauthorized')) clearAdminToken();
      alert(`Delete failed: ${res.error}`);
      return;
    }
    slotsCache.invalidateAll();
    loadSlots(filterSvcId);
  };

  const closeModal = () => {
    setShowModal(false);
    setCreateResult(null);
    setFormErrors({});
    setForm({ ...DEFAULT_FORM, serviceId: services[0]?.id || '' });
    setSelectedDays([1,2,3,4,5]);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div>

      {/* ── Toolbar ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {services.map(s => (
            <button
              key={s.id}
              className={`btn ${filterSvcId === s.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding:'8px 18px', fontSize:13 }}
              onClick={() => setFilterSvcId(s.id)}
            >
              {s.iconEmoji} {s.name}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary"
          style={{ padding:'10px 20px', fontSize:14 }}
          onClick={() => { setShowModal(true); setCreateResult(null); }}
        >
          + Create Slots
        </button>
      </div>

      {/* ── Create Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal-panel" style={{ maxWidth:520 }}>
            <button className="modal-close" onClick={closeModal}>✕</button>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:600, marginBottom:6 }}>
              Create Recurring Slots
            </h3>
            <p style={{ fontSize:13, color:'var(--color-slate)', marginBottom:24 }}>
              Dates are calculated server-side in your configured timezone.
            </p>

            {/* Result banner */}
            {createResult && (
              <div className={`banner ${createResult.ok ? 'banner-success' : 'banner-error'} mb-20`}>
                {createResult.msg}
              </div>
            )}

            {/* Service */}
            <div className="form-group mb-16">
              <label className="form-label">Service *</label>
              <select
                className={`form-input ${formErrors.serviceId ? 'error' : ''}`}
                value={form.serviceId}
                onChange={e => setField('serviceId', e.target.value)}
              >
                <option value="">Select a service…</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.iconEmoji} {s.name}</option>)}
              </select>
              {formErrors.serviceId && <p className="form-error">{formErrors.serviceId}</p>}
            </div>

            {/* Date range */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              <div className="form-group">
                <label className="form-label">Start Date *</label>
                <input
                  type="date"
                  className={`form-input ${formErrors.startDate ? 'error' : ''}`}
                  value={form.startDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setField('startDate', e.target.value)}
                />
                {formErrors.startDate && <p className="form-error">{formErrors.startDate}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">End Date *</label>
                <input
                  type="date"
                  className={`form-input ${formErrors.endDate ? 'error' : ''}`}
                  value={form.endDate}
                  min={form.startDate || new Date().toISOString().split('T')[0]}
                  onChange={e => setField('endDate', e.target.value)}
                />
                {formErrors.endDate && <p className="form-error">{formErrors.endDate}</p>}
              </div>
            </div>

            {/* Time + Duration */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              <div className="form-group">
                <label className="form-label">Start Time (24h) *</label>
                <input
                  type="time"
                  className={`form-input ${formErrors.startTime ? 'error' : ''}`}
                  value={form.startTime}
                  onChange={e => setField('startTime', e.target.value)}
                />
                {formErrors.startTime && <p className="form-error">{formErrors.startTime}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Duration (minutes) *</label>
                <select
                  className={`form-input ${formErrors.durationMinutes ? 'error' : ''}`}
                  value={form.durationMinutes}
                  onChange={e => setField('durationMinutes', Number(e.target.value))}
                >
                  {[15,30,45,60,75,90,120,150,180,240].map(m => (
                    <option key={m} value={m}>{m} min{m >= 60 ? ` (${m/60}h)` : ''}</option>
                  ))}
                </select>
                {formErrors.durationMinutes && <p className="form-error">{formErrors.durationMinutes}</p>}
              </div>
            </div>

            {/* Weekdays */}
            <div className="form-group mb-28">
              <label className="form-label">Repeat On *</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                {DAYS.map(d => (
                  <button
                    type="button"
                    key={d.v}
                    className={`btn ${selectedDays.includes(d.v) ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding:'6px 0', fontSize:13, width:48 }}
                    onClick={() => toggleDay(d.v)}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
              {formErrors.weekdays && <p className="form-error" style={{ marginTop:6 }}>{formErrors.weekdays}</p>}
              <p className="form-hint" style={{ marginTop:8 }}>
                {selectedDays.length === 0
                  ? 'No days selected'
                  : `Selected: ${selectedDays.map(d => DAYS[d].l).join(', ')}`
                }
              </p>
            </div>

            {/* Preview */}
            {form.startDate && form.endDate && form.startTime && selectedDays.length > 0 && (
              <div style={{ background:'var(--color-fog)', borderRadius:10, padding:'10px 14px', marginBottom:20, fontSize:13, color:'var(--color-graphite)' }}>
                <strong>Preview:</strong> Slots on {selectedDays.map(d => DAYS[d].l).join(', ')} from{' '}
                {form.startDate} to {form.endDate} at {form.startTime} for {form.durationMinutes} min
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary w-full"
              style={{ justifyContent:'center', padding:'14px' }}
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <>
                  <svg style={{ animation:'spin 1s linear infinite', width:16, height:16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                  Creating slots…
                </>
              ) : 'Create Slots'}
            </button>

            <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
          </div>
        </div>
      )}

      {/* ── Slots Table ── */}
      <div style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:20, overflow:'hidden' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--color-mist)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:600 }}>
            Upcoming Slots — Next 30 Days
          </h3>
          <button
            className="btn btn-ghost"
            style={{ padding:'6px 14px', fontSize:12 }}
            onClick={() => loadSlots(filterSvcId)}
          >
            ↺ Refresh
          </button>
        </div>

        {slotsStatus === 'loading' && (
          <div style={{ padding:24 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} className="skeleton" style={{ height:44, borderRadius:8, marginBottom:10 }} />
            ))}
          </div>
        )}

        {slotsStatus === 'error' && (
          <div style={{ padding:24 }}>
            <div className="banner banner-error">
              {slotsError}
              <button
                onClick={() => loadSlots(filterSvcId)}
                style={{ marginLeft:'auto', fontWeight:600, background:'none', border:'none', cursor:'pointer', color:'inherit', textDecoration:'underline' }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {slotsStatus === 'ready' && (
          <div style={{ overflowX:'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  {['Date & Time (UTC)','Service','Duration','Status','Actions'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {slots.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign:'center', padding:'40px 16px', color:'var(--color-slate)' }}>
                      No slots in the next 30 days. Use "Create Slots" above.
                    </td>
                  </tr>
                ) : slots.map(slot => (
                  <tr key={slot.id}>
                    <td style={{ fontWeight:500, whiteSpace:'nowrap' }}>
                      {new Date(slot.startUtc).toLocaleString('en-IN', {
                        timeZone:'UTC', weekday:'short', month:'short',
                        day:'numeric', hour:'2-digit', minute:'2-digit',
                      })} UTC
                    </td>
                    <td style={{ color:'var(--color-slate)', fontSize:13 }}>{slot.serviceName}</td>
                    <td style={{ color:'var(--color-slate)' }}>{slot.durationMinutes} min</td>
                    <td>
                      <span style={{
                        display:'inline-block', padding:'3px 10px', borderRadius:9999,
                        fontSize:11, fontWeight:700,
                        background: STATUS_CHIP[slot.status]?.bg || '#f3f4f6',
                        color:      STATUS_CHIP[slot.status]?.color || '#374151',
                      }}>
                        {slot.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        {slot.status === 'booked' ? (
                          <span style={{ fontSize:12, color:'var(--color-slate)', fontStyle:'italic' }}>Locked</span>
                        ) : (
                          <>
                            <button
                              className="btn btn-ghost"
                              style={{ padding:'4px 10px', fontSize:12 }}
                              onClick={() => handleToggle(slot)}
                            >
                              {slot.status === 'disabled' ? '👁 Enable' : '🚫 Disable'}
                            </button>
                            <button
                              onClick={() => handleDelete(slot)}
                              style={{
                                padding:'4px 10px', fontSize:12, cursor:'pointer',
                                border:'1px solid #fca5a5', borderRadius:8,
                                background:'#fef2f2', color:'#ef4444',
                              }}
                            >
                              🗑 Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
