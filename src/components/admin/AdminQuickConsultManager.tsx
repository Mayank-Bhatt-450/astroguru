// src/components/admin/AdminQuickConsultManager.tsx
import { useState, useEffect } from 'react';
import { adminFetchQuickConsults, adminAnswerQuickConsult } from '../../lib/api';
import type { QuickConsultRecord } from '../../lib/types';

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

function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5"
      style={{ animation: 'qc-spin 0.8s linear infinite', flexShrink: 0 }}>
      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round"/>
      <style>{`@keyframes qc-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

export default function AdminQuickConsultManager() {
  const [consults, setConsults] = useState<QuickConsultRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'received' | 'answered'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Form states for answering
  const [ans1, setAns1] = useState('');
  const [ans2, setAns2] = useState('');
  const [ans3, setAns3] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');

  const load = async () => {
    setStatus('loading');
    setError('');
    const token = getAdminToken();
    if (!token) {
      setStatus('error');
      setError('Admin token required.');
      return;
    }

    const result = await adminFetchQuickConsults(token);
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

    // Sort by createdAt descending
    const sorted = [...result.data].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setConsults(sorted);
    setStatus('ready');
  };

  useEffect(() => {
    load();
  }, []);

  const selectedRecord = consults.find(c => c.id === selectedId) || null;

  // Sync answer fields when selected record changes
  useEffect(() => {
    if (selectedRecord) {
      setAns1(selectedRecord.answer1 || '');
      setAns2(selectedRecord.answer2 || '');
      setAns3(selectedRecord.answer3 || '');
    }
  }, [selectedRecord]);

  // Reset success/error messages ONLY when switching selection or filter
  useEffect(() => {
    setSubmitSuccess('');
    setSubmitError('');
  }, [selectedId, filter]);

  const handleSubmitAnswers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    if (!ans1.trim()) {
      setSubmitError('Answer for Question 1 is required.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    const token = getAdminToken();
    const result = await adminAnswerQuickConsult(token, selectedRecord.id, [
      ans1,
      selectedRecord.question2 ? ans2 : '',
      selectedRecord.question3 ? ans3 : '',
    ]);

    setSubmitting(false);

    if (!result.ok) {
      if (result.error?.toLowerCase().includes('unauthorized')) {
        clearAdminToken();
        setSubmitError('Unauthorized. Session expired. Please reload and re-authenticate.');
      } else {
        setSubmitError(result.error);
      }
      return;
    }

    setSubmitSuccess('Answers successfully saved and emailed to client!');
    
    // Reload data and preserve selection
    const reloadResult = await adminFetchQuickConsults(token);
    if (reloadResult.ok) {
      const sorted = [...reloadResult.data].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setConsults(sorted);
    }
  };

  const receivedCount = consults.filter(c => c.status === 'received').length;
  const answeredCount = consults.filter(c => c.status === 'answered').length;

  const displayed = consults.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Topbar/Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'received', 'answered'] as const).map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '6px 16px', fontSize: 13 }}
            onClick={() => setFilter(f)}
          >
            {f === 'all'
              ? `All (${consults.length})`
              : f === 'received'
              ? `Received / Unanswered (${receivedCount})`
              : `Answered (${answeredCount})`}
          </button>
        ))}
        <button
          className="btn btn-ghost"
          style={{ padding: '6px 14px', fontSize: 13, marginLeft: 'auto' }}
          onClick={load}
        >
          ↺ Refresh
        </button>
      </div>

      {/* Main error banner */}
      {status === 'error' && (
        <div className="banner banner-error mb-16">
          <span>⚠ {error}</span>
          <button
            onClick={load}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}
          >
            Retry
          </button>
        </div>
      )}

      {status === 'loading' ? (
        <div style={{ padding: 24 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12, marginBottom: 12 }} />
          ))}
        </div>
      ) : (
        <div className="qc-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 24, alignItems: 'start' }}>
          <style>{`@media(max-width:700px){.qc-grid{grid-template-columns:1fr!important}}`}</style>
          {/* List panel */}
          <div style={{ background: 'white', border: '1px solid var(--color-mist)', borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-mist)', fontWeight: 600 }}>
              Questions List ({displayed.length})
            </div>
            <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
              {displayed.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-slate)' }}>
                  No consultations found.
                </div>
              ) : (
                displayed.map(c => {
                  const isSelected = c.id === selectedId;
                  const dateStr = new Date(c.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--color-fog)',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--color-lavender-field)' : 'transparent',
                        transition: 'background 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <strong style={{ fontSize: 14, color: 'var(--color-midnight-ink)' }}>{c.name}</strong>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 12,
                            background: c.status === 'answered' ? '#d1fae5' : '#fee2e2',
                            color: c.status === 'answered' ? '#065f46' : '#991b1b',
                            textTransform: 'uppercase',
                          }}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-slate)', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Q: {c.question1}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-slate)', textAlign: 'right' }}>
                        {dateStr}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Detail Panel */}
          <div style={{ background: 'white', border: '1px solid var(--color-mist)', borderRadius: 20, padding: 28, minHeight: 400 }}>
            {selectedRecord ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Header info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, borderBottom: '1px solid var(--color-mist)', paddingBottom: 20 }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--color-midnight-ink)', marginBottom: 6 }}>
                      {selectedRecord.name}
                    </h2>
                    <p style={{ fontSize: 14, color: 'var(--color-slate)' }}>
                      ✉ {selectedRecord.email} · ☎ {selectedRecord.phone}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 12, color: 'var(--color-slate)', marginBottom: 4 }}>
                      Submitted: {new Date(selectedRecord.createdAt).toLocaleString('en-IN')}
                    </p>
                    {selectedRecord.answeredAt && (
                      <p style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>
                        Answered: {new Date(selectedRecord.answeredAt).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status-specific banners */}
                {submitSuccess && <div className="banner banner-success">{submitSuccess}</div>}
                {submitError && <div className="banner banner-error">{submitError}</div>}

                {/* Form or read-only display */}
                <form onSubmit={handleSubmitAnswers} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Question 1 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-voltage-violet)' }}>Question 1</span>
                    </div>
                    <blockquote style={{ margin: 0, padding: '12px 16px', background: 'var(--color-fog)', borderLeft: '4px solid var(--color-ultra-violet)', borderRadius: '0 8px 8px 0', fontSize: 14, fontStyle: 'italic', color: 'var(--color-midnight-ink)', whiteSpace: 'pre-line' }}>
                      "{selectedRecord.question1}"
                    </blockquote>
                    <div className="form-group" style={{ marginTop: 8 }}>
                      <label className="form-label">Answer 1 *</label>
                      {selectedRecord.status === 'answered' ? (
                        <p style={{ background: '#f8fafc', padding: 16, border: '1px solid var(--color-mist)', borderRadius: 10, fontSize: 14, whiteSpace: 'pre-line', margin: 0, color: 'var(--color-midnight-ink)', lineHeight: 1.6 }}>
                          {selectedRecord.answer1}
                        </p>
                      ) : (
                        <textarea
                          className="form-input"
                          rows={4}
                          placeholder="Type your astrological reading/answer here..."
                          value={ans1}
                          onChange={e => setAns1(e.target.value)}
                          disabled={submitting}
                        />
                      )}
                    </div>
                  </div>

                  {/* Question 2 */}
                  {selectedRecord.question2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-voltage-violet)' }}>Question 2</span>
                      <blockquote style={{ margin: 0, padding: '12px 16px', background: 'var(--color-fog)', borderLeft: '4px solid var(--color-ultra-violet)', borderRadius: '0 8px 8px 0', fontSize: 14, fontStyle: 'italic', color: 'var(--color-midnight-ink)', whiteSpace: 'pre-line' }}>
                        "{selectedRecord.question2}"
                      </blockquote>
                      <div className="form-group" style={{ marginTop: 8 }}>
                        <label className="form-label">Answer 2</label>
                        {selectedRecord.status === 'answered' ? (
                          <p style={{ background: '#f8fafc', padding: 16, border: '1px solid var(--color-mist)', borderRadius: 10, fontSize: 14, whiteSpace: 'pre-line', margin: 0, color: 'var(--color-midnight-ink)', lineHeight: 1.6 }}>
                            {selectedRecord.answer2 || '—'}
                          </p>
                        ) : (
                          <textarea
                            className="form-input"
                            rows={4}
                            placeholder="Type answer here..."
                            value={ans2}
                            onChange={e => setAns2(e.target.value)}
                            disabled={submitting}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Question 3 */}
                  {selectedRecord.question3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-voltage-violet)' }}>Question 3</span>
                      <blockquote style={{ margin: 0, padding: '12px 16px', background: 'var(--color-fog)', borderLeft: '4px solid var(--color-ultra-violet)', borderRadius: '0 8px 8px 0', fontSize: 14, fontStyle: 'italic', color: 'var(--color-midnight-ink)', whiteSpace: 'pre-line' }}>
                        "{selectedRecord.question3}"
                      </blockquote>
                      <div className="form-group" style={{ marginTop: 8 }}>
                        <label className="form-label">Answer 3</label>
                        {selectedRecord.status === 'answered' ? (
                          <p style={{ background: '#f8fafc', padding: 16, border: '1px solid var(--color-mist)', borderRadius: 10, fontSize: 14, whiteSpace: 'pre-line', margin: 0, color: 'var(--color-midnight-ink)', lineHeight: 1.6 }}>
                            {selectedRecord.answer3 || '—'}
                          </p>
                        ) : (
                          <textarea
                            className="form-input"
                            rows={4}
                            placeholder="Type answer here..."
                            value={ans3}
                            onChange={e => setAns3(e.target.value)}
                            disabled={submitting}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {selectedRecord.status === 'received' && (
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ marginTop: 12, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Spinner color="white" /> Sending Answers…
                        </>
                      ) : (
                        '✉ Send Answers & Email Client'
                      )}
                    </button>
                  )}
                </form>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-slate)', padding: '60px 0' }}>
                <span style={{ fontSize: 64, marginBottom: 16 }}>⚡</span>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-midnight-ink)', marginBottom: 8 }}>
                  No Consultation Selected
                </h3>
                <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
                  Select a quick consultation from the list on the left to review questions and write answers.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}