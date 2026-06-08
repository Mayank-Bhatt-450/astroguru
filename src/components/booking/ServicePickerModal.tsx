// src/components/booking/ServicePickerModal.tsx
// ============================================================
// Full-screen slot-picker modal.
// Opens when ANY "Book Now" button is clicked anywhere on the page.
// Pre-selects the service that triggered the click.
// Clicking a time chip opens the BookingModal for that slot.
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
    openBooking,
    loadSlots,
    slotsByDay,
    slotsStatus,
    slotsError,
    userTimezone,
    boot,
  } = useAppStore();

  const services = useAppStore(selectServices).filter(s => s.isActive).sort((a, b) => a.order - b.order);

  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [selectedDayKey,  setSelectedDayKey]  = useState<string | null>(null);

  const weekStrip  = buildWeekStrip(slotsByDay, userTimezone, 14);
  const daySlots   = selectedDayKey ? (slotsByDay.get(selectedDayKey) ?? []) : [];
  const panelRef   = useRef<HTMLDivElement>(null);

  // ── Sync active service when modal opens ─────────────────
  useEffect(() => {
    if (!servicePickerOpen) return;
    const target = servicePickerServiceId ?? services[0]?.id ?? null;
    setActiveServiceId(target);
    setSelectedDayKey(null);
    if (target) loadSlots(target);
  }, [servicePickerOpen, servicePickerServiceId]);

  // Auto-select first day with available slots
  useEffect(() => {
    if (slotsStatus === 'ready' && !selectedDayKey) {
      const first = weekStrip.find(d => d.availableCount > 0);
      if (first) setSelectedDayKey(first.dayKey);
    }
  }, [slotsStatus]);

  // Lock body scroll while open
  useEffect(() => {
    if (servicePickerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [servicePickerOpen]);

  // Keyboard close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && servicePickerOpen) closeServicePicker();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [servicePickerOpen, closeServicePicker]);

  if (!servicePickerOpen) return null;

  const handleServiceTab = (id: string) => {
    setActiveServiceId(id);
    setSelectedDayKey(null);
    loadSlots(id);
  };

  const handleSlotClick = (slot: SlotDisplay) => {
    if (slot.status !== 'available') return;
    const svc = services.find(s => s.id === slot.serviceId);
    if (svc) openBooking(slot, svc); // closes this modal, opens BookingModal
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
      onClick={e => { if (e.target === e.currentTarget) closeServicePicker(); }}
    >
      {/* Panel — slides up from bottom on mobile, centered on desktop */}
      <div
        ref={panelRef}
        style={{
          background: 'var(--color-pure-white)',
          width: '100%',
          maxWidth: 820,
          margin: '0 auto',
          borderRadius: '28px 28px 0 0',
          boxShadow: '0 -8px 60px rgba(0,0,0,0.18)',
          maxHeight: '92vh',
          overflowY: 'auto',
          animation: 'slide-up 0.3s ease',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          position: 'sticky', top: 0, background: 'var(--color-pure-white)',
          borderBottom: '1px solid var(--color-mist)', zIndex: 10,
          padding: '18px 24px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p className="eyebrow" style={{ fontSize: 11, marginBottom: 2 }}>Schedule Your Session</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--color-midnight-ink)', lineHeight: 1.1 }}>
              Choose a Date & Time
            </h2>
          </div>
          <button
            onClick={closeServicePicker}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--color-fog)', border: '1px solid var(--color-mist)',
              color: 'var(--color-slate)', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fee2e2'; (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-fog)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-slate)'; }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px 32px' }}>

          {/* ── Service tabs ── */}
          {services.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {services.map(svc => {
                const isActive = activeServiceId === svc.id;
                const svcPricing = boot?.pricing.find(p => p.serviceId === svc.id);
                return (
                  <button
                    key={svc.id}
                    onClick={() => handleServiceTab(svc.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      gap: 2, padding: '10px 16px',
                      background: isActive ? 'var(--color-voltage-violet)' : 'var(--color-pure-white)',
                      color: isActive ? 'white' : 'var(--color-midnight-ink)',
                      border: isActive ? '1px solid var(--color-voltage-violet)' : '1px solid var(--color-mist)',
                      borderRadius: 14, cursor: 'pointer', transition: 'all 0.15s',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {svc.iconEmoji} {svc.name}
                    </span>
                    <span style={{ fontSize: 11, opacity: isActive ? 0.8 : 0.55 }}>
                      {svc.durationMinutes} min{svcPricing ? ` · ${svcPricing.priceDisplay}` : ''}
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
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-midnight-ink)' }}>{activeService.name}</p>
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
                ].join(' ')}
                onClick={() => {
                  if (day.hasSlots) { setSelectedDayKey(day.dayKey); }
                }}
                disabled={!day.hasSlots}
              >
                <span className="day-chip-name">{day.dayName}</span>
                <span className="day-chip-number">{day.dayNumber}</span>
                {day.availableCount > 0
                  ? <span className="day-chip-count">{day.availableCount}</span>
                  : <span style={{ fontSize: 9, color: 'var(--color-slate)', opacity: 0.5 }}>Full</span>
                }
              </button>
            ))}
          </div>

          {/* ── Day header ── */}
          {selectedDayKey && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 4 }}>
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
                <div key={i} className="skeleton" style={{ height: 38, width: 90, borderRadius: 9999 }} />
              ))}
            </div>
          )}

          {/* ── Error ── */}
          {slotsStatus === 'error' && (
            <div className="banner banner-error" style={{ marginTop: 16 }}>
              {slotsError}
              <button
                onClick={() => activeServiceId && loadSlots(activeServiceId)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}
              >
                Retry
              </button>
            </div>
          )}

          {/* ── Time chips ── */}
          {slotsStatus === 'ready' && selectedDayKey && (
            <>
              {daySlots.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--color-slate)', marginTop: 16 }}>No slots on this day.</p>
              ) : (
                <div className="time-chips" style={{ marginTop: 8 }}>
                  {daySlots.map(slot => (
                    <SlotChip
                      key={slot.id}
                      slot={slot}
                      pricing={pricing}
                      service={activeService ?? null}
                      onClick={() => handleSlotClick(slot)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── No day selected prompt ── */}
          {slotsStatus === 'ready' && !selectedDayKey && (
            <p style={{ fontSize: 14, color: 'var(--color-slate)', marginTop: 16 }}>
              ← Select a date above to see available times
            </p>
          )}

          {/* ── No slots at all ── */}
          {slotsStatus === 'ready' && weekStrip.every(d => d.availableCount === 0) && (
            <div style={{ marginTop: 20, padding: '16px 20px', background: 'var(--color-fog)', borderRadius: 12, textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No slots available in the next 14 days</p>
              <p style={{ fontSize: 13, color: 'var(--color-slate)' }}>
                Please check back soon or reach out via WhatsApp.
              </p>
            </div>
          )}

          {/* ── Urgency nudge ── */}
          {slotsStatus === 'ready' && selectedDayKey && daySlots.filter(s => s.status === 'available').length > 0 && (
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
          <div style={{ display: 'flex', gap: 20, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { icon: '🔐', label: 'Secure Payment' },
              { icon: '🔒', label: 'Private & Confidential' },
              { icon: '⚡', label: 'Instant Confirmation' },
              { icon: '📹', label: 'Google Meet Included' },
            ].map(t => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 13 }}>{t.icon}</span>
                <span style={{ fontSize: 12, color: 'var(--color-slate)', fontWeight: 500 }}>{t.label}</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      <style>{`
        @media (min-width: 640px) {
          /* On desktop: render as a centred bottom-sheet */
          [data-picker-panel] {
            border-radius: 28px !important;
            margin: auto !important;
            max-height: 88vh !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── Slot chip subcomponent ────────────────────────────────
function SlotChip({
  slot, pricing, service, onClick,
}: {
  slot:     SlotDisplay;
  pricing:  { priceDisplay: string } | null | undefined;
  service:  Service | null;
  onClick:  () => void;
}) {
  const available = slot.status === 'available';
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={available ? onClick : undefined}
      disabled={!available}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={available ? `Book ${slot.timeLabel} — ${formatSlotDuration(slot.durationMinutes)}` : 'Not available'}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 2, padding: '8px 14px',
        borderRadius: 9999,
        border: available
          ? hovered ? '2px solid var(--color-voltage-violet)' : '1px solid var(--color-mist)'
          : '1px solid var(--color-mist)',
        background: available
          ? hovered ? 'var(--color-voltage-violet)' : 'var(--color-pure-white)'
          : 'var(--color-fog)',
        color: available
          ? hovered ? 'white' : 'var(--color-midnight-ink)'
          : 'var(--color-slate)',
        opacity: available ? 1 : 0.45,
        cursor: available ? 'pointer' : 'not-allowed',
        transition: 'all 0.15s',
        textDecoration: available ? 'none' : 'line-through',
        minWidth: 72,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{slot.timeLabel}</span>
      {available && (
        <span style={{ fontSize: 10, opacity: hovered ? 0.85 : 0.55 }}>
          {formatSlotDuration(slot.durationMinutes)}
          {pricing ? ` · ${pricing.priceDisplay}` : ''}
        </span>
      )}
      {!available && (
        <span style={{ fontSize: 10 }}>Booked</span>
      )}
    </button>
  );
}
