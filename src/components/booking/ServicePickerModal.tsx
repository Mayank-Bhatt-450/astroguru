// src/components/booking/ServicePickerModal.tsx
// ============================================================
// Slot picker bottom-sheet modal.
//
// VALIDATION FIXES:
//   - Time chip click now calls selectSlotAndLock() instead of openBooking()
//   - selectSlotAndLock() does:  checkSlotAvailability → lockSlot → openBooking
//   - While checking/locking: chips are disabled, the active chip shows a spinner
//   - If check/lock fails: inline error banner appears, chips re-enable, slots refresh
//   - Past slots are never shown (filtered in store.loadSlots)
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useAppStore, selectServices } from '../../stores/appStore';
import { buildWeekStrip, formatDateHeader, formatSlotDuration } from '../../lib/slots';
import type { SlotDisplay, Service } from '../../lib/types';

export default function ServicePickerModal() {
  const {
    servicePickerOpen,
    servicePickerServiceId,
    closeServicePicker,
    selectSlotAndLock,
    slotCheckStatus,
    loadSlots,
    slotsByDay,
    slotsStatus,
    slotsError,
    userTimezone,
    boot,
  } = useAppStore();

  const services = useAppStore(selectServices)
    .filter(s => s.isActive)
    .sort((a, b) => a.order - b.order);

  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [selectedDayKey,  setSelectedDayKey]  = useState<string | null>(null);
  const [clickedSlotId,   setClickedSlotId]   = useState<string | null>(null); // tracks spinner
  const panelRef = useRef<HTMLDivElement>(null);

  const weekStrip = buildWeekStrip(slotsByDay, userTimezone, 14);
  const daySlots  = selectedDayKey ? (slotsByDay.get(selectedDayKey) ?? []) : [];

  const isBusy = slotCheckStatus.phase === 'checking' || slotCheckStatus.phase === 'locking';

  // ── Sync service on open ──────────────────────────────
  useEffect(() => {
    if (!servicePickerOpen) {
      setClickedSlotId(null);
      return;
    }
    const target = servicePickerServiceId ?? services[0]?.id ?? null;
    setActiveServiceId(target);
    setSelectedDayKey(null);
    setClickedSlotId(null);
    if (target) loadSlots(target);
  }, [servicePickerOpen, servicePickerServiceId]);

  // Auto-select first day with available slots after load
  useEffect(() => {
    if (slotsStatus === 'ready' && !selectedDayKey) {
      const first = weekStrip.find(d => d.availableCount > 0);
      if (first) setSelectedDayKey(first.dayKey);
    }
  }, [slotsStatus]);

  // Clear spinner when check finishes (success OR error)
  useEffect(() => {
    if (slotCheckStatus.phase === 'idle' || slotCheckStatus.phase === 'error') {
      setClickedSlotId(null);
    }
  }, [slotCheckStatus.phase]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = servicePickerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [servicePickerOpen]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && servicePickerOpen) closeServicePicker();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [servicePickerOpen, closeServicePicker]);

  if (!servicePickerOpen) return null;

  const handleServiceTab = (id: string) => {
    if (isBusy) return;
    setActiveServiceId(id);
    setSelectedDayKey(null);
    setClickedSlotId(null);
    loadSlots(id);
  };

  const handleSlotClick = async (slot: SlotDisplay) => {
    if (isBusy || slot.status !== 'available') return;
    const svc = services.find(s => s.id === slot.serviceId);
    if (!svc) return;
    setClickedSlotId(slot.id);
    // This does: check → lock → openBooking (or sets slotCheckStatus.error)
    await selectSlotAndLock(slot, svc);
  };

  const activeService = services.find(s => s.id === activeServiceId);
  const pricing       = activeService
    ? boot?.pricing.find(p => p.serviceId === activeService.id)
    : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(17,24,39,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'fade-in 0.2s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget && !isBusy) closeServicePicker(); }}
    >
      <div
        ref={panelRef}
        style={{
          background: 'var(--color-pure-white)',
          width: '100%', maxWidth: 820,
          margin: '0 auto',
          borderRadius: '28px 28px 0 0',
          boxShadow: '0 -8px 60px rgba(0,0,0,0.18)',
          maxHeight: '92vh',
          overflowY: 'auto',
          animation: 'slide-up 0.3s ease',
        }}
      >

        {/* ── Sticky header ── */}
        <div style={{
          position: 'sticky', top: 0,
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--color-mist)',
          zIndex: 10, padding: '18px 24px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p className="eyebrow" style={{ fontSize: 11, marginBottom: 2 }}>
              Schedule Your Session
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
              color: 'var(--color-midnight-ink)', lineHeight: 1.1,
            }}>
              Choose a Date & Time
            </h2>
          </div>
          <button
            onClick={() => { if (!isBusy) closeServicePicker(); }}
            disabled={isBusy}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--color-fog)', border: '1px solid var(--color-mist)',
              color: 'var(--color-slate)', fontSize: 16, cursor: isBusy ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', opacity: isBusy ? 0.4 : 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px 36px' }}>

          {/* ── Error banner (check/lock failure) ── */}
          {slotCheckStatus.phase === 'error' && (
            <div
              className="banner banner-error"
              style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Slot Unavailable</p>
                <p style={{ fontSize: 13 }}>{slotCheckStatus.message}</p>
              </div>
            </div>
          )}

          {/* ── Service tabs ── */}
          {services.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {services.map(svc => {
                const isActive  = activeServiceId === svc.id;
                const svcPricing = boot?.pricing.find(p => p.serviceId === svc.id);
                return (
                  <button
                    key={svc.id}
                    onClick={() => handleServiceTab(svc.id)}
                    disabled={isBusy}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      gap: 2, padding: '10px 16px',
                      background: isActive ? 'var(--color-voltage-violet)' : 'var(--color-pure-white)',
                      color: isActive ? 'white' : 'var(--color-midnight-ink)',
                      border: isActive
                        ? '1px solid var(--color-voltage-violet)'
                        : '1px solid var(--color-mist)',
                      borderRadius: 14, cursor: isBusy ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s', textAlign: 'left',
                      opacity: isBusy ? 0.6 : 1,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {svc.iconEmoji} {svc.name}
                    </span>
                    <span style={{ fontSize: 11, opacity: isActive ? 0.8 : 0.55 }}>
                      {svc.durationMinutes} min
                      {svcPricing ? ` · ${svcPricing.priceDisplay}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Active service info strip ── */}
          {activeService && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--color-lavender-field)', borderRadius: 12,
              padding: '12px 16px', marginBottom: 20, flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{activeService.iconEmoji}</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-midnight-ink)' }}>
                    {activeService.name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-slate)' }}>
                    {activeService.durationMinutes} min session
                    {pricing ? ` · ${pricing.priceDisplay}` : ''}
                  </p>
                </div>
              </div>
              <span className="badge badge-mint" style={{ fontSize: 11 }}>
                🌐 {userTimezone.replace(/_/g, ' ')}
              </span>
            </div>
          )}

          {/* ── Week strip ── */}
          <div className="week-strip" style={{ marginBottom: 8 }}>
            {weekStrip.map(day => (
              <button
                key={day.dayKey}
                className={[
                  'day-chip',
                  !day.hasSlots ? 'no-slots' : '',
                  selectedDayKey === day.dayKey ? 'active' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  if (!isBusy && day.hasSlots) setSelectedDayKey(day.dayKey);
                }}
                disabled={!day.hasSlots || isBusy}
                style={{ opacity: isBusy ? 0.6 : 1 }}
              >
                <span className="day-chip-name">{day.dayName}</span>
                <span className="day-chip-number">{day.dayNumber}</span>
                {day.availableCount > 0
                  ? <span className="day-chip-count">{day.availableCount}</span>
                  : <span style={{ fontSize: 9, color: 'var(--color-slate)', opacity: 0.5 }}>
                      Full
                    </span>
                }
              </button>
            ))}
          </div>

          {/* ── Day header ── */}
          {selectedDayKey && slotsStatus === 'ready' && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 20, marginBottom: 4,
            }}>
              <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>
                {formatDateHeader(selectedDayKey, userTimezone)}
              </h4>
              <span style={{ fontSize: 12, color: 'var(--color-slate)' }}>
                {daySlots.filter(s => s.status === 'available').length} available
              </span>
            </div>
          )}

          {/* ── Loading skeletons ── */}
          {slotsStatus === 'loading' && (
            <div className="time-chips" style={{ marginTop: 16 }}>
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className="skeleton"
                  style={{ height: 56, width: 90, borderRadius: 14 }} />
              ))}
            </div>
          )}

          {/* ── Fetch error ── */}
          {slotsStatus === 'error' && (
            <div className="banner banner-error" style={{ marginTop: 16 }}>
              {slotsError}
              <button
                onClick={() => activeServiceId && loadSlots(activeServiceId, true)}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  cursor: 'pointer', color: 'inherit', fontWeight: 700, textDecoration: 'underline',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* ── Time chips ── */}
          {slotsStatus === 'ready' && selectedDayKey && (
            daySlots.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--color-slate)', marginTop: 16 }}>
                No slots on this day.
              </p>
            ) : (
              <div className="time-chips" style={{ marginTop: 8 }}>
                {daySlots.map(slot => (
                  <SlotChip
                    key={slot.id}
                    slot={slot}
                    pricing={pricing}
                    isChecking={clickedSlotId === slot.id && isBusy}
                    isDisabled={isBusy && clickedSlotId !== slot.id}
                    onClick={() => handleSlotClick(slot)}
                  />
                ))}
              </div>
            )
          )}

          {/* ── No day selected prompt ── */}
          {slotsStatus === 'ready' && !selectedDayKey && (
            <p style={{ fontSize: 14, color: 'var(--color-slate)', marginTop: 16 }}>
              ← Select a date above to see available times
            </p>
          )}

          {/* ── No slots at all ── */}
          {slotsStatus === 'ready' && weekStrip.every(d => d.availableCount === 0) && (
            <div style={{
              marginTop: 20, padding: '20px', background: 'var(--color-fog)',
              borderRadius: 12, textAlign: 'center',
            }}>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                No slots available in the next 14 days
              </p>
              <p style={{ fontSize: 13, color: 'var(--color-slate)' }}>
                Please check back soon or reach out via WhatsApp.
              </p>
            </div>
          )}

          {/* ── Global checking/locking status ── */}
          {isBusy && (
            <div style={{
              marginTop: 20, display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', background: 'var(--color-lavender-field)',
              borderRadius: 10,
            }}>
              <Spinner size={16} color="var(--color-voltage-violet)" />
              <span style={{ fontSize: 13, color: 'var(--color-ultra-violet)', fontWeight: 500 }}>
                {slotCheckStatus.phase === 'checking'
                  ? 'Checking slot availability…'
                  : 'Reserving your slot…'
                }
              </span>
            </div>
          )}

          {/* ── Urgency nudge ── */}
          {!isBusy && slotCheckStatus.phase !== 'error' &&
           slotsStatus === 'ready' && selectedDayKey &&
           daySlots.filter(s => s.status === 'available').length > 0 && (
            <div style={{
              marginTop: 20, display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: 'var(--color-lavender-field)', borderRadius: 10,
            }}>
              <span className="pulse-dot" />
              <span style={{ fontSize: 13, color: 'var(--color-ultra-violet)', fontWeight: 500 }}>
                1-on-1 private session — each slot is exclusively yours
              </span>
            </div>
          )}

          {/* ── Trust row ── */}
          <div style={{
            display: 'flex', gap: 20, marginTop: 24,
            flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {[
              { icon: '🔐', label: 'Secure Payment' },
              { icon: '🔒', label: 'Private & Confidential' },
              { icon: '⚡', label: 'Instant Confirmation' },
              { icon: '📹', label: 'Google Meet Included' },
            ].map(t => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 13 }}>{t.icon}</span>
                <span style={{ fontSize: 12, color: 'var(--color-slate)', fontWeight: 500 }}>
                  {t.label}
                </span>
              </div>
            ))}
          </div>

        </div>
      </div>

      <style>{`
        @media (min-width: 640px) {
          [data-picker] { border-radius: 28px !important; margin: auto !important; }
        }
      `}</style>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────
function Spinner({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth="2.5"
      style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round"/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

// ── Slot chip ─────────────────────────────────────────────
function SlotChip({
  slot, pricing, isChecking, isDisabled, onClick,
}: {
  slot:       SlotDisplay;
  pricing:    { priceDisplay: string } | null | undefined;
  isChecking: boolean;
  isDisabled: boolean;
  onClick:    () => void;
}) {
  const available = slot.status === 'available';
  const [hovered, setHovered] = useState(false);

  const effectiveDisabled = !available || isDisabled || isChecking;

  const bgColor = (() => {
    if (isChecking) return 'var(--color-voltage-violet)';
    if (!available) return 'var(--color-fog)';
    if (hovered)   return 'var(--color-voltage-violet)';
    return 'var(--color-pure-white)';
  })();

  const textColor = (() => {
    if (isChecking || hovered) return 'white';
    if (!available) return 'var(--color-slate)';
    return 'var(--color-midnight-ink)';
  })();

  return (
    <button
      onClick={effectiveDisabled ? undefined : onClick}
      disabled={effectiveDisabled}
      onMouseEnter={() => { if (!effectiveDisabled) setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
      title={
        isChecking ? 'Checking availability…'
        : !available ? 'Not available'
        : `Book ${slot.timeLabel} — ${formatSlotDuration(slot.durationMinutes)}`
      }
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 3, padding: '10px 14px', borderRadius: 14, minWidth: 80,
        border: available
          ? hovered || isChecking
            ? '2px solid var(--color-voltage-violet)'
            : '1px solid var(--color-mist)'
          : '1px solid var(--color-mist)',
        background: bgColor,
        color: textColor,
        opacity: isDisabled && !isChecking ? 0.45 : 1,
        cursor: effectiveDisabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        textDecoration: !available ? 'line-through' : 'none',
        position: 'relative',
      }}
    >
      {isChecking ? (
        <>
          <Spinner size={14} color="white" />
          <span style={{ fontSize: 11, opacity: 0.85 }}>Checking…</span>
        </>
      ) : (
        <>
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
            {slot.timeLabel}
          </span>
          <span style={{ fontSize: 10, opacity: hovered ? 0.85 : 0.55 }}>
            {available
              ? `${formatSlotDuration(slot.durationMinutes)}${pricing ? ` · ${pricing.priceDisplay}` : ''}`
              : 'Booked'
            }
          </span>
        </>
      )}
    </button>
  );
}
