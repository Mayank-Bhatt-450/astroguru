// src/components/admin/AdminDashboard.tsx
// FIXES:
// 1. Token fetched inside useEffect/handlers — never at module init
// 2. Unauthorized response clears cached token and re-prompts
// 3. Full error message surfaced in UI
// 4. Filters (date range, status) wired up

import { useState, useEffect } from 'react';
import { adminFetchBookings } from '../../lib/api';
import type { BookingRecord } from '../../lib/types';

// ── Token helper (runtime only) ───────────────────────────
function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  let t = localStorage.getItem('admin_token') || '';
  if (!t) {
    t = window.prompt('Enter admin token:') || '';
    if (t) localStorage.setItem('admin_token', t);
  }
  return t;
}
function clearAdminToken() { localStorage.removeItem('admin_token'); }

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  confirmed:         { bg: '#d1fae5', color: '#065f46' },
  'pending-payment': { bg: '#fef3c7', color: '#92400e' },
  cancelled:         { bg: '#fee2e2', color: '#991b1b' },
};

export default function AdminDashboard() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [status,   setStatus]   = useState<'loading'|'ready'|'error'>('loading');
  const [error,    setError]    = useState('');
  const [filter,   setFilter]   = useState<'all'|'confirmed'|'pending-payment'|'cancelled'>('all');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setStatus('loading');
    setError('');
    const token = getAdminToken();
    if (!token) { setStatus('error'); setError('Admin token required.'); return; }

    const result = await adminFetchBookings(token, {
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
    });

    if (!result.ok) {
      if (result.error?.toLowerCase().includes('unauthorized')) {
        clearAdminToken();
        setError('Invalid admin token. Token cleared — click Retry and enter the correct token.');
      } else {
        setError(result.error);
      }
      setStatus('error');
      return;
    }
    setBookings(result.data);
    setStatus('ready');
  };

  const confirmed  = bookings.filter(b => b.status === 'confirmed').length;
  const pending    = bookings.filter(b => b.status === 'pending-payment').length;
  const cancelled  = bookings.filter(b => b.status === 'cancelled').length;

  const displayed  = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
  const recent     = [...displayed]
    .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  const stats = [
    { label: 'Confirmed (30d)', value: confirmed, ...STATUS_STYLE.confirmed },
    { label: 'Pending Payment', value: pending,   ...STATUS_STYLE['pending-payment'] },
    { label: 'Cancelled',       value: cancelled, ...STATUS_STYLE.cancelled },
    { label: 'Total (30d)',     value: bookings.length,
      bg: 'var(--color-lavender-field)', color: 'var(--color-voltage-violet)' },
  ];

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:32 }}>
        {status === 'loading'
          ? [1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height:100, borderRadius:16 }} />)
          : stats.map(s => (
            <div key={s.label} style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:16, padding:'20px 20px 18px' }}>
              <p style={{ fontSize:11, color:'var(--color-slate)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>
                {s.label}
              </p>
              <div style={{ fontFamily:'var(--font-display)', fontSize:36, fontWeight:600, color:s.color, lineHeight:1 }}>
                {s.value}
              </div>
            </div>
          ))
        }
      </div>

      {/* Error */}
      {status === 'error' && (
        <div className="banner banner-error mb-24">
          <span>⚠ {error}</span>
          <button
            onClick={load}
            style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'inherit', fontWeight:700, textDecoration:'underline' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter tabs */}
      {status === 'ready' && (
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {(['all','confirmed','pending-payment','cancelled'] as const).map(f => (
            <button
              key={f}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding:'6px 16px', fontSize:13 }}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `All (${bookings.length})` : f === 'confirmed' ? `Confirmed (${confirmed})` : f === 'pending-payment' ? `Pending (${pending})` : `Cancelled (${cancelled})`}
            </button>
          ))}
          <button
            className="btn btn-ghost"
            style={{ padding:'6px 14px', fontSize:13, marginLeft:'auto' }}
            onClick={load}
          >
            ↺ Refresh
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background:'white', border:'1px solid var(--color-mist)', borderRadius:20, overflow:'hidden' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--color-mist)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:600 }}>
            {filter === 'all' ? 'All Bookings' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Bookings`}
          </h3>
          <span style={{ fontSize:13, color:'var(--color-slate)' }}>Last 30 days · showing {recent.length}</span>
        </div>

        {status === 'loading' ? (
          <div style={{ padding:24 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} className="skeleton" style={{ height:44, borderRadius:8, marginBottom:10 }} />
            ))}
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  {['Name','Email','Service','Status','Booked On','Meet Link'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign:'center', color:'var(--color-slate)', padding:'40px 16px' }}>
                      No bookings found.
                    </td>
                  </tr>
                ) : recent.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight:500 }}>{b.name}</td>
                    <td style={{ color:'var(--color-slate)', fontSize:13 }}>{b.email}</td>
                    <td style={{ color:'var(--color-slate)', fontSize:13 }}>{b.serviceId}</td>
                    <td>
                      <span style={{
                        display:'inline-block', padding:'3px 10px', borderRadius:9999, fontSize:11, fontWeight:700,
                        background: STATUS_STYLE[b.status]?.bg || '#f3f4f6',
                        color:      STATUS_STYLE[b.status]?.color || '#374151',
                      }}>
                        {b.status}
                      </span>
                    </td>
                    <td style={{ color:'var(--color-slate)', fontSize:13, whiteSpace:'nowrap' }}>
                      {new Date(b.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td>
                      {b.meetLink && b.meetLink.startsWith('http')
                        ? <a href={b.meetLink} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize:13, color:'var(--color-voltage-violet)', fontWeight:600 }}>
                            Join ↗
                          </a>
                        : <span style={{ color:'var(--color-slate)', fontSize:13 }}>—</span>
                      }
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
