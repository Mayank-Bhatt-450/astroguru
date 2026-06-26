// src/components/admin/AdminAddonsManager.tsx
// ============================================================
// Admin panel: create, edit, enable/disable, and delete add-ons.
// Add-ons are stored in the "Addons" Google Sheet.
// ============================================================

import { useState, useEffect } from 'react';
import { adminUpdateContent } from '../../lib/api';
import { bootCache } from '../../lib/cache';
import type { Addon } from '../../lib/types';

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

export default function AdminAddonsManager() {
  const [addons,  setAddons]  = useState<Addon[]>([]);
  const [status,  setStatus]  = useState<'loading'|'ready'|'error'>('loading');
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editing, setEditing] = useState<Addon | null>(null);
  const [isNew,   setIsNew]   = useState(false);

  // Load existing add-ons from boot cache
  useEffect(() => {
    const cached = bootCache.get();
    if (cached?.addons) {
      setAddons(cached.addons);
    }
    setStatus('ready');
  }, []);

  const openNew = () => {
    setEditing({
      id: `addon_${Date.now()}`,
      ...EMPTY_ADDON,
      order: addons.length + 1,
    });
    setIsNew(true);
  };

  const openEdit = (addon: Addon) => {
    setEditing({ ...addon });
    setIsNew(false);
  };

  const cancelEdit = () => { setEditing(null); setIsNew(false); };

  const saveAddon = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setSaveMsg({ ok: false, msg: 'Name is required.' }); return; }
    if (editing.price < 0)    { setSaveMsg({ ok: false, msg: 'Price must be ≥ 0.' }); return; }

    // Derive priceDisplay
    const priceDisplay = `₹${(editing.price / 100).toLocaleString('en-IN')}`;
    const updated = { ...editing, priceDisplay };

    const newList = isNew
      ? [...addons, updated]
      : addons.map(a => a.id === updated.id ? updated : a);

    // Convert to sheet rows: id | name | description | price | priceDisplay | isActive | serviceIds | popularDefault | order
    const rows = newList.map(a => [
      a.id, a.name, a.description, a.price, a.priceDisplay,
      a.isActive ? 'TRUE' : 'FALSE',
      a.serviceIds.join(','),
      a.popularDefault ? 'TRUE' : 'FALSE',
      a.order,
    ]);

    const token = getAdminToken();
    if (!token) { setSaveMsg({ ok: false, msg: 'Admin token required.' }); return; }

    setSaving(true); setSaveMsg(null);
    const res = await adminUpdateContent(token, 'Addons', rows);
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
    const rows    = newList.map(a => [
      a.id, a.name, a.description, a.price, a.priceDisplay,
      a.isActive ? 'TRUE' : 'FALSE',
      a.serviceIds.join(','),
      a.popularDefault ? 'TRUE' : 'FALSE',
      a.order,
    ]);
    const token = getAdminToken();
    if (!token) return;
    setSaving(true);
    const res = await adminUpdateContent(token, 'Addons', rows);
    setSaving(false);
    if (res.ok) setAddons(newList);
    else setSaveMsg({ ok: false, msg: res.error });
  };

  const deleteAddon = async (id: string) => {
    if (!window.confirm('Delete this add-on? This cannot be undone.')) return;
    const newList = addons.filter(a => a.id !== id);
    const rows    = newList.map(a => [
      a.id, a.name, a.description, a.price, a.priceDisplay,
      a.isActive ? 'TRUE' : 'FALSE',
      a.serviceIds.join(','),
      a.popularDefault ? 'TRUE' : 'FALSE',
      a.order,
    ]);
    const token = getAdminToken();
    if (!token) return;
    setSaving(true);
    const res = await adminUpdateContent(token, 'Addons', rows);
    setSaving(false);
    if (res.ok) { setAddons(newList); setSaveMsg({ ok: true, msg: 'Add-on deleted.' }); setTimeout(() => setSaveMsg(null), 2000); }
    else setSaveMsg({ ok: false, msg: res.error });
  };

  // ── Edit form ─────────────────────────────────────────────
  if (editing) {
    return (
      <div>
        <button onClick={cancelEdit} style={{ marginBottom: 20, fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Back to Add-ons
        </button>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
          {isNew ? 'Create Add-on' : 'Edit Add-on'}
        </h3>

        {saveMsg && (
          <div className={`banner ${saveMsg.ok ? 'banner-success' : 'banner-error'} mb-16`}>{saveMsg.msg}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-input" value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Detailed Transit Report" />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={2} value={editing.description}
              onChange={e => setEditing({ ...editing, description: e.target.value })}
              placeholder="What does this add-on include?" />
          </div>

          <div className="form-group">
            <label className="form-label">Price (in paise, e.g. 19900 = ₹199)</label>
            <input type="number" className="form-input" value={editing.price}
              onChange={e => setEditing({ ...editing, price: parseInt(e.target.value) || 0 })}
              min={0} step={100} />
            <p style={{ fontSize: 12, color: 'var(--color-slate)', marginTop: 4 }}>
              Preview: ₹{((editing.price) / 100).toLocaleString('en-IN')}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">
              Service IDs (comma-separated, leave blank for all services)
            </label>
            <input className="form-input" value={editing.serviceIds.join(',')}
              onChange={e => setEditing({ ...editing, serviceIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              placeholder="astrology,numerology (or leave blank for all)" />
          </div>

          <div className="form-group">
            <label className="form-label">Sort Order</label>
            <input type="number" className="form-input" value={editing.order}
              onChange={e => setEditing({ ...editing, order: parseInt(e.target.value) || 0 })}
              min={0} />
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={editing.isActive}
                onChange={e => setEditing({ ...editing, isActive: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--color-voltage-violet)' }} />
              Active (visible to customers)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={editing.popularDefault}
                onChange={e => setEditing({ ...editing, popularDefault: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--color-voltage-violet)' }} />
              Auto-select for "Most Popular" tier
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button className="btn btn-primary" onClick={saveAddon} disabled={saving}
            style={{ flex: 1, justifyContent: 'center' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>Add-ons</h3>
          <p style={{ fontSize: 13, color: 'var(--color-slate)', marginTop: 2 }}>Optional extras customers can add to any booking.</p>
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
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--color-fog)', borderRadius: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No add-ons yet</p>
          <p style={{ fontSize: 13, color: 'var(--color-slate)', marginBottom: 20 }}>Create your first add-on to offer optional extras at checkout.</p>
          <button className="btn btn-primary" onClick={openNew}>+ Create First Add-on</button>
        </div>
      )}

      {status === 'ready' && addons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {addons.map(addon => (
            <div key={addon.id} style={{
              background: 'white', border: '1px solid var(--color-mist)',
              borderRadius: 14, padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
              opacity: addon.isActive ? 1 : 0.55,
            }}>
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
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-lavender-field)', color: 'var(--color-ultra-violet)', fontWeight: 700 }}>
                      ✦ Popular default
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-slate)' }}>
                  {addon.priceDisplay}
                  {addon.serviceIds.length > 0 && ` · ${addon.serviceIds.join(', ')}`}
                  {addon.description && ` · ${addon.description.slice(0, 60)}${addon.description.length > 60 ? '…' : ''}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => toggleActive(addon)}
                  disabled={saving}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: '1px solid var(--color-mist)', background: 'white', cursor: 'pointer',
                    color: 'var(--color-slate)',
                  }}
                >
                  {addon.isActive ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => openEdit(addon)} disabled={saving}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--color-mist)', background: 'white', cursor: 'pointer', color: 'var(--color-slate)' }}>
                  Edit
                </button>
                <button onClick={() => deleteAddon(addon.id)} disabled={saving}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #fca5a5', background: '#fff', cursor: 'pointer', color: '#ef4444' }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--color-lavender-field)', borderRadius: 12, fontSize: 12, color: 'var(--color-ultra-violet)' }}>
        <strong>Tip:</strong> Add-ons with "Auto-select for Most Popular" checked will be pre-selected in the booking flow for services that have a "Most Popular" pricing tier. Customers can still deselect them.
      </div>
    </div>
  );
}