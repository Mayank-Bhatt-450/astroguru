// src/components/admin/AdminSlotManager.tsx
// ─────────────────────────────────────────────────────────────
// Features:
//   • Create recurring slots (server-side date calculation)
//   • Enable / Disable individual slots
//   • Delete unbooked slots
//   • Cancel a booking  → frees slot, deletes Calendar event, emails client
//   • Reschedule a booking → moves to a new available slot, creates new
//     Calendar event + Meet link, emails client
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  adminCreateSlots,
  adminToggleSlot,
  adminDeleteSlot,
  adminCancelBooking,
  adminRescheduleBooking,
  adminGetBookingBySlot,
  fetchSlots,
  type BookingBySlotResult,
} from '../../lib/api';
import { slotsCache } from '../../lib/cache';
import type { Slot, SlotTemplate } from '../../lib/types';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  let t = localStorage.getItem('admin_token') || '';
  if (!t) {
    t = window.prompt('Enter admin token:') || '';
    if (t) localStorage.setItem('admin_token', t);
  }
  return t;
}
function clearToken() { localStorage.removeItem('admin_token'); }

function handleAuthError(err: string) {
  if (err.toLowerCase().includes('unauthorized')) clearToken();
}

function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5"
      style={{ animation: 'slotSpin 0.8s linear infinite', flexShrink: 0 }}>
      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round"/>
      <style>{`@keyframes slotSpin { to { transform:rotate(360deg); } }`}</style>
    </svg>
  );
}

const STATUS_CHIP: Record<string, { bg: string; color: string }> = {
  available: { bg: '#d1fae5', color: '#065f46' },
  booked:    { bg: '#fee2e2', color: '#991b1b' },
  locked:    { bg: '#fef3c7', color: '#92400e' },
  disabled:  { bg: '#f3f4f6', color: '#6b7280' },
};

const DAYS = [
  { v: 0, l: 'Sun' }, { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' },
  { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' },
];

interface Props {
  services: { id: string; name: string; iconEmoji: string }[];
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

/** Small modal wrapper */
function Modal({
  title, onClose, children, maxWidth = 500,
}: {
  title: string; onClose: () => void;
  children: React.ReactNode; maxWidth?: number;
}) {
  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-panel animate-slide-up" style={{ maxWidth }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: 20,
          fontWeight: 600, marginBottom: 20,
        }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

/** Cancel booking modal */
function CancelModal({
  slot, booking, onDone, onClose,
}: {
  slot:    Slot;
  booking: BookingBySlotResult;
  onDone:  () => void;
  onClose: () => void;
}) {
  const [reason,  setReason]  = useState('');
  const [busy,    setBusy]    = useState(false);
  const [errMsg,  setErrMsg]  = useState('');

  const handleCancel = async () => {
    if (!reason.trim()) { setErrMsg('Please enter a reason for cancellation.'); return; }
    setBusy(true); setErrMsg('');
    const token = getAdminToken();
    const res   = await adminCancelBooking(token, booking.id, reason);
    setBusy(false);
    if (!res.ok) {
      handleAuthError(res.error);
      setErrMsg(res.error);
      return;
    }
    slotsCache.invalidateAll();
    onDone();
  };

  const slotTime = new Date(slot.startUtc).toLocaleString('en-IN', {
    timeZone: 'UTC', weekday: 'short', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <Modal title="Cancel Booking" onClose={onClose}>
      {/* Booking summary */}
      <div style={{
        background: '#fee2e2', border: '1px solid #fca5a5',
        borderRadius: 12, padding: '14px 16px', marginBottom: 20,
      }}>
        <p style={{ fontWeight: 600, fontSize: 14, color: '#991b1b', marginBottom: 6 }}>
          ⚠ This action cannot be undone
        </p>
        <p style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.6 }}>
          Cancelling will free the slot, delete the Google Calendar event,
          and send a cancellation email to the client.
        </p>
      </div>

      <div style={{
        background: 'var(--color-fog)', borderRadius: 12,
        padding: '14px 16px', marginBottom: 20,
      }}>
        <p style={{ fontSize: 13, marginBottom: 4 }}>
          <strong>Client:</strong> {booking.name} ({booking.email})
        </p>
        <p style={{ fontSize: 13, marginBottom: 4 }}>
          <strong>Service:</strong> {booking.serviceId}
        </p>
        <p style={{ fontSize: 13 }}>
          <strong>Scheduled:</strong> {slotTime} UTC
        </p>
      </div>

      {errMsg && <div className="banner banner-error mb-16">{errMsg}</div>}

      <div className="form-group mb-20">
        <label className="form-label">Reason for Cancellation *</label>
        <textarea
          className="form-input"
          rows={3}
          placeholder="e.g. Practitioner unavailable, public holiday…"
          value={reason}
          onChange={e => { setReason(e.target.value); setErrMsg(''); }}
        />
        <p className="form-hint">This will be included in the cancellation email to the client.</p>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-ghost"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={onClose}
          disabled={busy}
        >
          Keep Booking
        </button>
        <button
          onClick={handleCancel}
          disabled={busy}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '12px 20px', borderRadius: 12, border: 'none',
            background: '#ef4444', color: 'white', fontWeight: 600,
            fontSize: 15, cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <><Spinner color="white" /> Cancelling…</> : '🗑 Cancel Booking'}
        </button>
      </div>
    </Modal>
  );
}

/** Reschedule booking modal */
function RescheduleModal({
  slot, booking, allSlots, onDone, onClose,
}: {
  slot:      Slot;
  booking:   BookingBySlotResult;
  allSlots:  Slot[];
  onDone:    () => void;
  onClose:   () => void;
}) {
  const [newSlotId, setNewSlotId] = useState('');
  const [reason,    setReason]    = useState('');
  const [busy,      setBusy]      = useState(false);
  const [errMsg,    setErrMsg]    = useState('');
  const [result,    setResult]    = useState<{
    newMeetLink: string; newSlotId: string;
  } | null>(null);

  // Available slots excluding the current one
  const availableSlots = allSlots
    .filter(s => s.status === 'available' && s.id !== slot.id)
    .sort((a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime());

  const handleReschedule = async () => {
    if (!newSlotId) { setErrMsg('Please select a new time slot.'); return; }
    if (!reason.trim()) { setErrMsg('Please enter a reason for rescheduling.'); return; }
    setBusy(true); setErrMsg('');
    const token = getAdminToken();
    const res   = await adminRescheduleBooking(token, booking.id, newSlotId, reason);
    setBusy(false);
    if (!res.ok) {
      handleAuthError(res.error);
      setErrMsg(res.error);
      return;
    }
    slotsCache.invalidateAll();
    setResult({ newMeetLink: res.data.newMeetLink, newSlotId: res.data.newSlotId });
  };

  const slotTime = new Date(slot.startUtc).toLocaleString('en-IN', {
    timeZone: 'UTC', weekday: 'short', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // Success screen
  if (result) {
    const newSlotObj = allSlots.find(s => s.id === result.newSlotId);
    const newTime    = newSlotObj
      ? new Date(newSlotObj.startUtc).toLocaleString('en-IN', {
          timeZone: 'UTC', weekday: 'short', month: 'short',
          day: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : result.newSlotId;

    return (
      <Modal title="Booking Rescheduled" onClose={onDone}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
          <h4 style={{
            fontFamily: 'var(--font-display)', fontSize: 18,
            fontWeight: 600, color: '#10b981', marginBottom: 12,
          }}>
            Successfully Rescheduled
          </h4>
          <p style={{ fontSize: 14, color: 'var(--color-slate)', marginBottom: 16 }}>
            The booking has been moved to <strong style={{ color: 'var(--color-midnight-ink)' }}>
              {newTime} UTC
            </strong>
          </p>
          <div style={{
            background: '#d1fae5', borderRadius: 10,
            padding: '10px 14px', marginBottom: 20,
          }}>
            <p style={{ fontSize: 12, color: '#065f46', fontWeight: 500, marginBottom: 4 }}>
              New Google Meet Link
            </p>
            {result.newMeetLink.startsWith('http') ? (
              <a href={result.newMeetLink} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--color-voltage-violet)', wordBreak: 'break-all' }}>
                {result.newMeetLink}
              </a>
            ) : (
              <p style={{ fontSize: 12, color: '#065f46' }}>{result.newMeetLink}</p>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-slate)', marginBottom: 20 }}>
            A rescheduling confirmation email with the new Meet link has been sent to{' '}
            <strong>{booking.email}</strong>
          </p>
          <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={onDone}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Reschedule Booking" onClose={onClose} maxWidth={540}>
      {/* Current booking info */}
      <div style={{
        background: 'var(--color-lavender-field)', borderRadius: 12,
        padding: '14px 16px', marginBottom: 20,
      }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Current Booking</p>
        <p style={{ fontSize: 13, color: 'var(--color-graphite)', marginBottom: 2 }}>
          <strong>Client:</strong> {booking.name} ({booking.email})
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-graphite)' }}>
          <strong>Current time:</strong> {slotTime} UTC
        </p>
      </div>

      {errMsg && <div className="banner banner-error mb-16">{errMsg}</div>}

      {/* New slot selector */}
      <div className="form-group mb-16">
        <label className="form-label">New Time Slot *</label>
        {availableSlots.length === 0 ? (
          <div className="banner banner-warning">
            No available slots to reschedule to. Create new slots first.
          </div>
        ) : (
          <select
            className={`form-input ${!newSlotId && errMsg ? 'error' : ''}`}
            value={newSlotId}
            onChange={e => { setNewSlotId(e.target.value); setErrMsg(''); }}
          >
            <option value="">— Select a new slot —</option>
            {availableSlots.map(s => {
              const t = new Date(s.startUtc).toLocaleString('en-IN', {
                timeZone: 'UTC', weekday: 'short', month: 'short',
                day: 'numeric', hour: '2-digit', minute: '2-digit',
              });
              return (
                <option key={s.id} value={s.id}>
                  {t} UTC — {s.durationMinutes} min
                </option>
              );
            })}
          </select>
        )}
        <p className="form-hint">Only available slots in the next 30 days are shown.</p>
      </div>

      <div className="form-group mb-24">
        <label className="form-label">Reason for Rescheduling *</label>
        <textarea
          className="form-input"
          rows={3}
          placeholder="e.g. Client requested a different time, practitioner conflict…"
          value={reason}
          onChange={e => { setReason(e.target.value); setErrMsg(''); }}
        />
        <p className="form-hint">Included in the rescheduling email to the client.</p>
      </div>

      {/* What will happen */}
      <div style={{
        background: 'var(--color-fog)', borderRadius: 10,
        padding: '12px 14px', marginBottom: 20, fontSize: 13,
        color: 'var(--color-graphite)', lineHeight: 1.7,
      }}>
        <strong>This action will:</strong>
        <ul style={{ paddingLeft: 16, marginTop: 4 }}>
          <li>Free the current slot (make it available again)</li>
          <li>Book the selected new slot</li>
          <li>Delete the old Google Calendar event</li>
          <li>Create a new Calendar event with a new Meet link</li>
          <li>Email the client with the new details</li>
        </ul>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-ghost"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={handleReschedule}
          disabled={busy || availableSlots.length === 0}
        >
          {busy
            ? <><Spinner color="white" /> Rescheduling…</>
            : '📅 Reschedule'
          }
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
interface SlotFormData {
  serviceId:       string;
  startDate:       string;
  endDate:         string;
  startTime:       string;
  durationMinutes: number;
}

const DEFAULT_FORM: SlotFormData = {
  serviceId: '', startDate: '', endDate: '', startTime: '', durationMinutes: 60,
};

export default function AdminSlotManager({ services }: Props) {
  const [slots,        setSlots]        = useState<Slot[]>([]);
  const [slotsStatus,  setSlotsStatus]  = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [slotsError,   setSlotsError]   = useState('');
  const [filterSvcId,  setFilterSvcId]  = useState(services[0]?.id || '');

  // Create modal
  const [showCreate,   setShowCreate]   = useState(false);
  const [form,         setForm]         = useState<SlotFormData>({ ...DEFAULT_FORM, serviceId: services[0]?.id || '' });
  const [selectedDays, setSelectedDays] = useState<number[]>([1,2,3,4,5]);
  const [formErrors,   setFormErrors]   = useState<Record<string, string>>({});
  const [creating,     setCreating]     = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Cancel / Reschedule modals
  const [cancelTarget,      setCancelTarget]      = useState<{ slot: Slot; booking: BookingBySlotResult } | null>(null);
  const [rescheduleTarget,  setRescheduleTarget]  = useState<{ slot: Slot; booking: BookingBySlotResult } | null>(null);
  const [actionLoading,     setActionLoading]     = useState<string | null>(null); // slotId being actioned
  const [actionError,       setActionError]       = useState('');

  // ── Load slots ────────────────────────────────────────────
  const loadSlots = useCallback(async (svcId: string) => {
    setSlotsStatus('loading');
    setSlotsError('');
    const today = new Date().toISOString().split('T')[0];
    const res   = await fetchSlots(svcId, today, 30);
    if (!res.ok) { setSlotsStatus('error'); setSlotsError(res.error); return; }
    setSlots([...res.data].sort(
      (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
    ));
    setSlotsStatus('ready');
  }, []);

  useEffect(() => {
    if (filterSvcId) loadSlots(filterSvcId);
  }, [filterSvcId, loadSlots]);

  // ── Create form helpers ───────────────────────────────────
  const setField = (k: keyof SlotFormData, v: string | number) => {
    setForm(f => ({ ...f, [k]: v }));
    setFormErrors(e => ({ ...e, [k]: '' }));
  };
  const toggleDay = (d: number) => {
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
    setFormErrors(e => ({ ...e, weekdays: '' }));
  };
  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!form.serviceId) e.serviceId = 'Select a service';
    if (!form.startDate) e.startDate = 'Required';
    if (!form.endDate)   e.endDate   = 'Required';
    if (!form.startTime) e.startTime = 'Required';
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      e.endDate = 'Must be on or after start date';
    if (selectedDays.length === 0) e.weekdays = 'Select at least one day';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    const token = getAdminToken();
    if (!token) { setCreateResult({ ok: false, msg: 'Admin token required.' }); return; }
    setCreating(true); setCreateResult(null);
    const tmpl: SlotTemplate = {
      serviceId:       form.serviceId,
      startDate:       form.startDate,
      endDate:         form.endDate,
      startTime:       form.startTime,
      durationMinutes: form.durationMinutes,
      weekdays:        selectedDays,
    };
    const res = await adminCreateSlots(token, tmpl);
    setCreating(false);
    if (!res.ok) {
      handleAuthError(res.error);
      setCreateResult({ ok: false, msg: res.error });
      return;
    }
    setCreateResult({ ok: true, msg: `✓ Created ${res.data.created} slot(s)` });
    slotsCache.invalidateAll();
    setForm({ ...DEFAULT_FORM, serviceId: form.serviceId });
    setSelectedDays([1,2,3,4,5]);
    // Switch the table filter to the service we just created slots for
    // so the user can immediately see the new rows — not the previous service.
    setFilterSvcId(form.serviceId);
    loadSlots(form.serviceId);
    setTimeout(() => { setShowCreate(false); setCreateResult(null); }, 1800);
  };

  // ── Toggle / Delete ───────────────────────────────────────
  const handleToggle = async (slot: Slot) => {
    setActionLoading(slot.id); setActionError('');
    const token = getAdminToken();
    const res   = await adminToggleSlot(token, slot.id, slot.status === 'disabled');
    setActionLoading(null);
    if (!res.ok) { handleAuthError(res.error); setActionError(res.error); return; }
    slotsCache.invalidateAll();
    loadSlots(filterSvcId);
  };

  const handleDelete = async (slot: Slot) => {
    if (!window.confirm('Delete this slot?')) return;
    setActionLoading(slot.id); setActionError('');
    const token = getAdminToken();
    const res   = await adminDeleteSlot(token, slot.id);
    setActionLoading(null);
    if (!res.ok) { handleAuthError(res.error); setActionError(res.error); return; }
    slotsCache.invalidateAll();
    loadSlots(filterSvcId);
  };

  // ── Cancel ────────────────────────────────────────────────
  const handleCancelClick = async (slot: Slot) => {
    setActionLoading(slot.id); setActionError('');
    const token = getAdminToken();
    const res   = await adminGetBookingBySlot(token, slot.id);
    setActionLoading(null);
    if (!res.ok) { handleAuthError(res.error); setActionError(res.error); return; }
    if (!res.data) {
      setActionError('No confirmed booking found for this slot.');
      return;
    }
    setCancelTarget({ slot, booking: res.data });
  };

  // ── Reschedule ────────────────────────────────────────────
  const handleRescheduleClick = async (slot: Slot) => {
    setActionLoading(slot.id); setActionError('');
    const token = getAdminToken();
    const res   = await adminGetBookingBySlot(token, slot.id);
    setActionLoading(null);
    if (!res.ok) { handleAuthError(res.error); setActionError(res.error); return; }
    if (!res.data) {
      setActionError('No confirmed booking found for this slot.');
      return;
    }
    setRescheduleTarget({ slot, booking: res.data });
  };

  const closeModals = () => {
    setCancelTarget(null);
    setRescheduleTarget(null);
    loadSlots(filterSvcId);
  };

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 24,
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {services.map(s => (
            <button
              key={s.id}
              className={`btn ${filterSvcId === s.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '8px 18px', fontSize: 13 }}
              onClick={() => setFilterSvcId(s.id)}
            >
              {s.iconEmoji} {s.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost"
            style={{ padding: '8px 14px', fontSize: 13 }}
            onClick={() => loadSlots(filterSvcId)}
          >
            ↺ Refresh
          </button>
          <button
            className="btn btn-primary"
            style={{ padding: '10px 20px', fontSize: 14 }}
            onClick={() => { setShowCreate(true); setCreateResult(null); }}
          >
            + Create Slots
          </button>
        </div>
      </div>

      {/* ── Global action error ── */}
      {actionError && (
        <div className="banner banner-error mb-16" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>⚠ {actionError}</span>
          <button onClick={() => setActionError('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Create Slots Modal ── */}
      {showCreate && (
        <Modal title="Create Recurring Slots" onClose={() => { setShowCreate(false); setCreateResult(null); }}>
          {createResult && (
            <div className={`banner ${createResult.ok ? 'banner-success' : 'banner-error'} mb-16`}>
              {createResult.msg}
            </div>
          )}

          <div className="form-group mb-16">
            <label className="form-label">Service *</label>
            <select
              className={`form-input ${formErrors.serviceId ? 'error' : ''}`}
              value={form.serviceId}
              onChange={e => setField('serviceId', e.target.value)}
            >
              <option value="">Select…</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.iconEmoji} {s.name}</option>
              ))}
            </select>
            {formErrors.serviceId && <p className="form-error">{formErrors.serviceId}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input type="date" className={`form-input ${formErrors.startDate ? 'error' : ''}`}
                value={form.startDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setField('startDate', e.target.value)} />
              {formErrors.startDate && <p className="form-error">{formErrors.startDate}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input type="date" className={`form-input ${formErrors.endDate ? 'error' : ''}`}
                value={form.endDate}
                min={form.startDate || new Date().toISOString().split('T')[0]}
                onChange={e => setField('endDate', e.target.value)} />
              {formErrors.endDate && <p className="form-error">{formErrors.endDate}</p>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Start Time (24h) *</label>
              <input type="time" className={`form-input ${formErrors.startTime ? 'error' : ''}`}
                value={form.startTime}
                onChange={e => setField('startTime', e.target.value)} />
              {formErrors.startTime && <p className="form-error">{formErrors.startTime}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Duration *</label>
              <select className="form-input" value={form.durationMinutes}
                onChange={e => setField('durationMinutes', Number(e.target.value))}>
                {[15,30,45,60,75,90,120,150,180,240].map(m => (
                  <option key={m} value={m}>{m} min{m >= 60 ? ` (${m/60}h)` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group mb-24">
            <label className="form-label">Repeat On *</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {DAYS.map(d => (
                <button type="button" key={d.v}
                  className={`btn ${selectedDays.includes(d.v) ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '6px 0', fontSize: 13, width: 48 }}
                  onClick={() => toggleDay(d.v)}>
                  {d.l}
                </button>
              ))}
            </div>
            {formErrors.weekdays && <p className="form-error" style={{ marginTop: 6 }}>{formErrors.weekdays}</p>}
            <p className="form-hint" style={{ marginTop: 6 }}>
              {selectedDays.length === 0
                ? 'No days selected'
                : `Selected: ${selectedDays.map(d => DAYS[d].l).join(', ')}`}
            </p>
          </div>

          {form.startDate && form.endDate && form.startTime && selectedDays.length > 0 && (
            <div style={{
              background: 'var(--color-fog)', borderRadius: 10,
              padding: '10px 14px', marginBottom: 20, fontSize: 13,
              color: 'var(--color-graphite)',
            }}>
              <strong>Preview:</strong> {selectedDays.map(d => DAYS[d].l).join(', ')} from {form.startDate} to {form.endDate} at {form.startTime} · {form.durationMinutes} min
            </div>
          )}

          <button type="button" className="btn btn-primary w-full"
            style={{ justifyContent: 'center', padding: '14px' }}
            onClick={handleCreate} disabled={creating}>
            {creating ? <><Spinner color="white" /> Creating…</> : 'Create Slots'}
          </button>
          <style>{`@keyframes slotSpin { to { transform:rotate(360deg); } }`}</style>
        </Modal>
      )}

      {/* ── Cancel Modal ── */}
      {cancelTarget && (
        <CancelModal
          slot={cancelTarget.slot}
          booking={cancelTarget.booking}
          onDone={closeModals}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {/* ── Reschedule Modal ── */}
      {rescheduleTarget && (
        <RescheduleModal
          slot={rescheduleTarget.slot}
          booking={rescheduleTarget.booking}
          allSlots={slots}
          onDone={closeModals}
          onClose={() => setRescheduleTarget(null)}
        />
      )}

      {/* ── Slots Table ── */}
      <div style={{ background: 'white', border: '1px solid var(--color-mist)', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--color-mist)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>
            Upcoming Slots — Next 30 Days
          </h3>
          <span style={{ fontSize: 13, color: 'var(--color-slate)' }}>
            {slots.length} slot{slots.length !== 1 ? 's' : ''}
          </span>
        </div>

        {slotsStatus === 'loading' && (
          <div style={{ padding: 24 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 10 }} />
            ))}
          </div>
        )}

        {slotsStatus === 'error' && (
          <div style={{ padding: 24 }}>
            <div className="banner banner-error">
              {slotsError}
              <button onClick={() => loadSlots(filterSvcId)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit', textDecoration: 'underline' }}>
                Retry
              </button>
            </div>
          </div>
        )}

        {slotsStatus === 'ready' && (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  {['Date & Time (UTC)', 'Service', 'Duration', 'Status', 'Actions'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{
                      textAlign: 'center', padding: '40px 16px',
                      color: 'var(--color-slate)',
                    }}>
                      No slots in the next 30 days. Use "Create Slots" above.
                    </td>
                  </tr>
                ) : slots.map(slot => {
                  const isLoading = actionLoading === slot.id;
                  return (
                    <tr key={slot.id}>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {new Date(slot.startUtc).toLocaleString('en-IN', {
                          timeZone: 'UTC', weekday: 'short', month: 'short',
                          day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })} UTC
                      </td>
                      <td style={{ color: 'var(--color-slate)', fontSize: 13 }}>
                        {slot.serviceName}
                      </td>
                      <td style={{ color: 'var(--color-slate)' }}>
                        {slot.durationMinutes} min
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px',
                          borderRadius: 9999, fontSize: 11, fontWeight: 700,
                          background: STATUS_CHIP[slot.status]?.bg || '#f3f4f6',
                          color:      STATUS_CHIP[slot.status]?.color || '#374151',
                        }}>
                          {slot.status}
                        </span>
                      </td>
                      <td>
                        {isLoading ? (
                          <Spinner size={18} color="var(--color-voltage-violet)" />
                        ) : slot.status === 'booked' ? (
                          /* Booked slot — show cancel + reschedule */
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleRescheduleClick(slot)}
                              style={{
                                padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                                border: '1px solid var(--color-mist)', borderRadius: 8,
                                background: 'var(--color-lavender-field)',
                                color: 'var(--color-voltage-violet)', fontWeight: 600,
                              }}
                            >
                              📅 Reschedule
                            </button>
                            <button
                              onClick={() => handleCancelClick(slot)}
                              style={{
                                padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                                border: '1px solid #fca5a5', borderRadius: 8,
                                background: '#fef2f2', color: '#ef4444', fontWeight: 600,
                              }}
                            >
                              🗑 Cancel
                            </button>
                          </div>
                        ) : (
                          /* Available / disabled / locked slot */
                          <div style={{ display: 'flex', gap: 6 }}>
                            {slot.status !== 'locked' && (
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '4px 10px', fontSize: 12 }}
                                onClick={() => handleToggle(slot)}
                              >
                                {slot.status === 'disabled' ? '👁 Enable' : '🚫 Disable'}
                              </button>
                            )}
                            {slot.status !== 'locked' && (
                              <button
                                onClick={() => handleDelete(slot)}
                                style={{
                                  padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                                  border: '1px solid #fca5a5', borderRadius: 8,
                                  background: '#fef2f2', color: '#ef4444',
                                }}
                              >
                                🗑
                              </button>
                            )}
                            {slot.status === 'locked' && (
                              <span style={{ fontSize: 12, color: 'var(--color-slate)', fontStyle: 'italic' }}>
                                Held — awaiting payment
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}