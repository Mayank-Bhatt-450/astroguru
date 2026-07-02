// src/components/admin/AdminAddonsManager.tsx
// ============================================================
// Admin panel: create, edit, enable/disable, and delete add-ons.
// Service IDs field is now a multi-select dropdown.
// ============================================================

import { useState, useEffect } from 'react';
import { adminUpdateContent } from '../../lib/api';
import { bootCache } from '../../lib/cache';
import type { Addon, Service } from '../../lib/types';

function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  let t = localStorage.getItem('admin_token') || '';
  if (!t) { t = window.prompt('Enter admin token:') || ''; if (t) localStorage.setItem('admin_token', t); }
  return t;
}
function clearAdminToken() { localStorage.removeItem('admin_token'); }

function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
      style={{ animation: 'addonSpin 0.8s linear infinite', flexShrink: 0 }}>
      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round"/>
      <style>{`@keyframes addonSpin { to { transform:rotate(360deg); } }`}</style>
    </svg>
  );
}

const EMPTY_ADDON: Omit<Addon, 'id'> = {
  name: '',
  description: '',
  price: 0,
  priceDisplay: '',
  isActive: true,
  serviceIds: [],
  popularDefault: false,
  order: 0,
};

// ── Multi-select component ────────────────────────────────
function ServiceMultiSelect({
  services,
  selectedIds,
  onChange,
}: {
  services: Service[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(s => s !== id)
        : [...selectedIds, id]
    );
  };

  const selectAll  = () => onChange(services.map(s => s.id));
  const clearAll   = () => onChange([]);

  return (
    <div>
      {/* Chip toggle buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {services.map(svc => {
          const selected = selectedIds.includes(svc.id);
          return (
            <button
              key={svc.id}
              type="button"
              onClick={() => toggle(svc.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                borderRadius: 9999,
                border: selected
                  ? '2px solid var(--color-voltage-violet)'
                  : '1.5px solid var(--color-mist)',
                background: selected ? 'var(--color-lavender-field)' : 'white',
                color: selected ? 'var(--color-voltage-violet)' : 'var(--color-graphite)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              aria-pressed={selected}
            >
              <span style={{ fontSize: 15 }}>{svc.iconEmoji}</span>
              {svc.name}
              {selected && (
                <span style={{ marginLeft: 2, fontSize: 11, fontWeight: 700 }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Select all / clear shortcuts */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="button"
          onClick={selectAll}
          style={{ fontSize: 12, color: 'var(--color-voltage-violet)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
        >
          Select all
        </button>
        <span style={{ color: 'var(--color-mist)' }}>·</span>
        <button
          type="button"
          onClick={clearAll}
          style={{ fontSize: 12, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
        >
          Clear (applies to all services)
        </button>
      </div>

      {/* Helper text */}
      <p style={{ fontSize: 11, color: 'var(--color-slate)', marginTop: 6 }}>
        {selectedIds.length === 0
          ? '⬆ No services selected — this add-on will appear for all services.'
          : `Selected: ${selectedIds.join(', ')}`}
      </p>
    </div>
  );
}

export default function AdminAddonsManager() {
  const [addons,   setAddons]   = useState<Addon[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [status,   setStatus]   = useState<'loading'|'ready'|'error'>('loading');
  const [saving,   setSaving]   = useState(false);
  const [saveMsg,  setSaveMsg]  = useState<{ ok: boolean; msg: string } | null>(null);
  const [editing,  setEditing]  = useState<Addon | null>(null);
  const [isNew,    setIsNew]    = useState(false);

  useEffect(() => {
    const cached = bootCache.get();
    if (cached?.addons)   setAddons(cached.addons);
    if (cached?.services) setServices(cached.services.filter(s => s.isActive));
    setStatus('ready');
  }, []);

  const toRows = (list: Addon[]) =>
    list.map(a => [
      a.id, a.name, a.description, a.price, a.priceDisplay,
      a.isActive ? 'TRUE' : 'FALSE',
      a.serviceIds.join(','),
      a.popularDefault ? 'TRUE' : 'FALSE',
      a.order,
    ]);

  const openNew = () => {
    setEditing({ id: `addon_${Date.now()}`, ...EMPTY_ADDON, order: addons.length + 1 });
    setIsNew(true);
  };
  const openEdit  = (addon: Addon) => { setEditing({ ...addon }); setIsNew(false); };
  const cancelEdit = () => { setEditing(null); setIsNew(false); };

  const saveAddon = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setSaveMsg({ ok: false, msg: 'Name is required.' }); return; }
    if (editing.price < 0)    { setSaveMsg({ ok: false, msg: 'Price must be ≥ 0.' }); return; }

    const priceDisplay = `₹${(editing.price / 100).toLocaleString('en-IN')}`;
    const updated = { ...editing, priceDisplay };
    const newList = isNew
      ? [...addons, updated]
      : addons.map(a => a.id === updated.id ? updated : a);

    const token = getAdminToken();
    if (!token) { setSaveMsg({ ok: false, msg: 'Admin token required.' }); return; }

    setSaving(true); setSaveMsg(null);
    const res = await adminUpdateContent(token, 'Addons', toRows(newList));
    setSaving(false);

    if (!res.ok) {
      if (res.error?.toLowerCase().includes('unauthorized')) clearAdminToken();
      setSaveMsg({ ok: false, msg: res.error });
      return;
    }
    setAddons(newList);
    setEditing(null); setIsNew(false);
    setSaveMsg({ ok: true, msg: isNew ? 'Add-on created!' : 'Add-on updated!' });
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const toggleActive = async (addon: Addon) => {
    const updated = { ...addon, isActive: !addon.isActive };
    const newList = addons.map(a => a.id === addon.id ? updated : a);
    const token = getAdminToken();
    if (!token) return;
    setSaving(true);
    const res = await adminUpdateContent(token, 'Addons', toRows(newList));
    setSaving(false);
    if (res.ok) setAddons(newList);
    else setSaveMsg({ ok: false, msg: res.error });
  };

  const deleteAddon = async (id: string) => {
    if (!window.confirm('Delete this add-on? This cannot be undone.')) return;
    const newList = addons.filter(a => a.id !== id);
    const token = getAdminToken();
    if (!token) return;
    setSaving(true);
    const res = await adminUpdateContent(token, 'Addons', toRows(newList));
    setSaving(false);
    if (res.ok) {
      setAddons(newList);
      setSaveMsg({ ok: true, msg: 'Add-on deleted.' });
      setTimeout(() => setSaveMsg(null), 2000);
    } else {
      setSaveMsg({ ok: false, msg: res.error });
    }
  };

  // ── Edit form ─────────────────────────────────────────────
  if (editing) {
    return (
      <div>
        <button
          onClick={cancelEdit}
          style={{ marginBottom: 20, fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← Back to Add-ons
        </button>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
          {isNew ? 'Create Add-on' : 'Edit Add-on'}
        </h2>

        {saveMsg && (
          <div className={`banner ${saveMsg.ok ? 'banner-success' : 'banner-error'} mb-16`}>{saveMsg.msg}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="addon-name">Name *</label>
            <input
              id="addon-name"
              className="form-input"
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Detailed Transit Report"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="addon-desc">Description</label>
            <textarea
              id="addon-desc"
              className="form-input"
              rows={2}
              value={editing.description}
              onChange={e => setEditing({ ...editing, description: e.target.value })}
              placeholder="What does this add-on include?"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="addon-price">Price (in paise — e.g. 19900 = ₹199)</label>
            <input
              id="addon-price"
              type="number"
              className="form-input"
              value={editing.price}
              onChange={e => setEditing({ ...editing, price: parseInt(e.target.value) || 0 })}
              min={0}
              step={100}
            />
            <p style={{ fontSize: 12, color: 'var(--color-slate)', marginTop: 4 }}>
              Preview: ₹{((editing.price) / 100).toLocaleString('en-IN')}
            </p>
          </div>

          {/* ── Multi-select Service IDs ── */}
          <div className="form-group">
            <label className="form-label">Applicable Services</label>
            {services.length > 0 ? (
              <ServiceMultiSelect
                services={services}
                selectedIds={editing.serviceIds}
                onChange={ids => setEditing({ ...editing, serviceIds: ids })}
              />
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-slate)' }}>
                No services found. Leave empty to apply to all services.
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="addon-order">Sort Order</label>
            <input
              id="addon-order"
              type="number"
              className="form-input"
              value={editing.order}
              onChange={e => setEditing({ ...editing, order: parseInt(e.target.value) || 0 })}
              min={0}
              style={{ maxWidth: 120 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={e => setEditing({ ...editing, isActive: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--color-voltage-violet)' }}
              />
              Active (visible to customers)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={editing.popularDefault}
                onChange={e => setEditing({ ...editing, popularDefault: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--color-voltage-violet)' }}
              />
              Auto-select for "Most Popular" tier
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
          <button
            className="btn btn-primary"
            onClick={saveAddon}
            disabled={saving}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            {saving ? <><Spinner color="white" /> Saving…</> : (isNew ? 'Create Add-on' : 'Save Changes')}
          </button>
          <button className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────
  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Add-ons</h2>
          <p style={{ fontSize: 13, color: 'var(--color-slate)', marginTop: 2 }}>
            Optional extras customers can add to any booking.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew} disabled={saving}>
          + New Add-on
        </button>
      </div>

      {saveMsg && (
        <div className={`banner ${saveMsg.ok ? 'banner-success' : 'banner-error'} mb-16`}>{saveMsg.msg}</div>
      )}

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 14 }} />)}
        </div>
      )}

      {status === 'ready' && addons.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--color-fog)', borderRadius: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No add-ons yet</p>
          <p style={{ fontSize: 13, color: 'var(--color-slate)', marginBottom: 20 }}>
            Create your first add-on to offer optional extras at checkout.
          </p>
          <button className="btn btn-primary" onClick={openNew}>+ Create First Add-on</button>
        </div>
      )}

      {status === 'ready' && addons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {addons.map(addon => (
            <div
              key={addon.id}
              style={{
                background: 'white',
                border: '1px solid var(--color-mist)',
                borderRadius: 14,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                opacity: addon.isActive ? 1 : 0.55,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{addon.name}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 9999,
                    background: addon.isActive ? '#d1fae5' : '#f3f4f6',
                    color: addon.isActive ? '#065f46' : '#6b7280',
                    fontWeight: 700,
                  }}>
                    {addon.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {addon.popularDefault && (
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 9999,
                      background: 'var(--color-lavender-field)',
                      color: 'var(--color-ultra-violet)', fontWeight: 700,
                    }}>
                      ✦ Popular default
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-slate)' }}>
                  {addon.priceDisplay}
                  {addon.serviceIds.length > 0
                    ? ` · ${addon.serviceIds.join(', ')}`
                    : ' · All services'}
                  {addon.description && ` · ${addon.description.slice(0, 60)}${addon.description.length > 60 ? '…' : ''}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                  onClick={() => toggleActive(addon)}
                  disabled={saving}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: '1px solid var(--color-mist)', background: 'white',
                    cursor: 'pointer', color: 'var(--color-slate)',
                  }}
                >
                  {addon.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => openEdit(addon)}
                  disabled={saving}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: '1px solid var(--color-mist)', background: 'white',
                    cursor: 'pointer', color: 'var(--color-slate)',
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteAddon(addon.id)}
                  disabled={saving}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: '1px solid #fca5a5', background: '#fff',
                    cursor: 'pointer', color: '#ef4444',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--color-lavender-field)', borderRadius: 12, fontSize: 12, color: 'var(--color-ultra-violet)' }}>
        <strong>Tip:</strong> Select specific services to restrict an add-on, or leave all unselected to show it for every service.
        Add-ons with "Auto-select for Most Popular" pre-select for popular pricing tiers — customers can still deselect.
      </div>
    </div>
  );
}