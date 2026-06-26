// src/components/islands/SlotPickerSection.tsx
import { useState, useEffect } from 'react';
import { useAppStore, selectServices } from '../../stores/appStore';
import { buildWeekStrip, formatDateHeader } from '../../lib/slots';
import type { SlotDisplay } from '../../lib/types';

export default function SlotPickerSection() {
  const { loadSlots, slotsByDay, slotsStatus, slotsError, userTimezone, openBooking } = useAppStore();
  const services = useAppStore(selectServices).filter(s => s.isActive);

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedDayKey,    setSelectedDayKey]    = useState<string | null>(null);
  const [selectedSlotId,    setSelectedSlotId]    = useState<string | null>(null);

  const weekStrip = buildWeekStrip(slotsByDay, userTimezone, 14);

  useEffect(() => {
    if (services.length > 0 && !selectedServiceId) {
      setSelectedServiceId(services[0].id);
      loadSlots(services[0].id);
    }
  }, [services.length]);

  useEffect(() => {
    if (slotsStatus === 'ready' && !selectedDayKey) {
      const first = weekStrip.find(d => d.availableCount > 0);
      if (first) setSelectedDayKey(first.dayKey);
    }
  }, [slotsStatus]);

  const daySlots     = selectedDayKey ? (slotsByDay.get(selectedDayKey) ?? []) : [];
  const availableDay = daySlots.filter(s => s.status === 'available').length;

  const handleSlotClick = (slot: SlotDisplay) => {
    if (slot.status !== 'available') return;
    setSelectedSlotId(slot.id);
    const svc = services.find(s => s.id === slot.serviceId);
    if (svc) openBooking(slot, svc, '', '', '');
  };

  const handleServiceChange = (id: string) => {
    setSelectedServiceId(id);
    setSelectedDayKey(null);
    setSelectedSlotId(null);
    loadSlots(id);
  };

  return (
    <section
      className="section orb-container animate-on-scroll"
      id="book"
      style={{ background: 'var(--color-pure-white)', scrollMarginTop: '80px', overflow: 'hidden', position: 'relative' }}
    >
      <div className="orb orb-lavender" style={{ width: 700, height: 700, top: -200, right: -200, opacity: 0.5 }} />

      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="text-center mb-48">
          <p className="eyebrow mb-12">Schedule Your Session</p>
          <h2 className="text-heading">Choose Your Slot</h2>
          <div className="divider-violet" />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <span className="badge badge-mint" style={{ fontSize: 11 }}>
              🌐 Times shown in: {userTimezone.replace(/_/g,' ')}
            </span>
          </div>
        </div>

        {/* Service selector */}
        {services.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
            {services.map(svc => (
              <button
                key={svc.id}
                className={selectedServiceId === svc.id ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '8px 20px', fontSize: 14 }}
                onClick={() => handleServiceChange(svc.id)}
              >
                {svc.iconEmoji} {svc.name}
              </button>
            ))}
          </div>
        )}

        <div className="card card-featured" style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(20px,5vw,36px)', boxShadow: 'var(--shadow-card)' }}>

          <div className="week-strip" style={{ marginBottom: 4 }}>
            {weekStrip.map(day => (
              <button
                key={day.dayKey}
                className={`day-chip ${!day.hasSlots ? 'no-slots' : ''} ${selectedDayKey === day.dayKey ? 'active' : ''}`}
                onClick={() => { if (day.hasSlots) { setSelectedDayKey(day.dayKey); setSelectedSlotId(null); } }}
                disabled={!day.hasSlots}
                aria-pressed={selectedDayKey === day.dayKey}
                aria-label={`${day.dayName} ${day.dayNumber} — ${day.availableCount} slots`}
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

          {selectedDayKey && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
              <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--color-midnight-ink)' }}>
                {formatDateHeader(selectedDayKey, userTimezone)}
              </h4>
              <span style={{ fontSize: 12, color: 'var(--color-slate)' }}>{availableDay} slot{availableDay !== 1 ? 's' : ''} available</span>
            </div>
          )}

          {slotsStatus === 'loading' && (
            <div className="time-chips">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="skeleton" style={{ height: 36, width: 90, borderRadius: 9999 }} />
              ))}
            </div>
          )}

          {slotsStatus === 'error' && (
            <div className="banner banner-error mt-20">
              {slotsError}
              <button onClick={() => selectedServiceId && loadSlots(selectedServiceId)}
                style={{ marginLeft: 'auto', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}>
                Retry
              </button>
            </div>
          )}

          {slotsStatus === 'ready' && selectedDayKey && (
            <div className="time-chips">
              {daySlots.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--color-slate)' }}>No slots on this day.</p>
              ) : daySlots.map(slot => (
                <button
                  key={slot.id}
                  className={`time-chip ${slot.status !== 'available' ? 'booked' : ''} ${selectedSlotId === slot.id ? 'selected' : ''}`}
                  onClick={() => handleSlotClick(slot)}
                  disabled={slot.status !== 'available'}
                  aria-label={`${slot.timeLabel}${slot.status !== 'available' ? ' — Not available' : ''}`}
                >
                  {slot.timeLabel}
                </button>
              ))}
            </div>
          )}

          {slotsStatus === 'ready' && !selectedDayKey && (
            <p style={{ marginTop: 20, fontSize: 14, color: 'var(--color-slate)' }}>
              ← Select a date above to see available times
            </p>
          )}

          {slotsStatus === 'ready' && selectedDayKey && availableDay > 0 && (
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--color-lavender-field)', borderRadius: 10 }}>
              <span className="pulse-dot" />
              <span style={{ fontSize: 13, color: 'var(--color-ultra-violet)', fontWeight: 500 }}>
                Each slot is a private 1-on-1 session — exclusively yours
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(16px,4vw,32px)', marginTop: 32, flexWrap: 'wrap' }}>
          {[
            { icon: '🔐', label: 'Secure Payment' },
            { icon: '🔒', label: 'Private & Confidential' },
            { icon: '⚡', label: 'Instant Confirmation' },
            { icon: '📹', label: 'Google Meet Included' },
          ].map(t => (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              <span style={{ fontSize: 13, color: 'var(--color-slate)', fontWeight: 500 }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}