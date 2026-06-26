// src/components/booking/AddonsStep.tsx
// ============================================================
// Add-ons selection step in the booking flow.
// Shows all active add-ons for the selected service.
// "Most Popular" tiers have their popular add-ons pre-selected.
// ============================================================

import { useState } from 'react';
import { useAppStore, selectAddons } from '../../stores/appStore';
import type { Addon } from '../../lib/types';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

function AddonCard({
  addon,
  selected,
  onToggle,
}: {
  addon: Addon;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '14px 16px',
        borderRadius: 14,
        border: selected
          ? '2px solid var(--color-voltage-violet)'
          : '1.5px solid var(--color-mist)',
        background: selected ? 'var(--color-lavender-field)' : 'var(--color-pure-white)',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        transition: 'all 0.18s ease',
        boxShadow: selected ? '0 0 0 3px rgba(124,58,237,0.08)' : 'none',
      }}
      aria-pressed={selected}
    >
      {/* Checkbox */}
      <span style={{
        flexShrink: 0,
        width: 22, height: 22,
        borderRadius: 6,
        border: selected ? '2px solid var(--color-voltage-violet)' : '2px solid var(--color-mist)',
        background: selected ? 'var(--color-voltage-violet)' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: 13, fontWeight: 700,
        transition: 'all 0.15s',
        marginTop: 1,
      }}>
        {selected ? '✓' : ''}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, marginBottom: 3,
        }}>
          <span style={{
            fontWeight: 600, fontSize: 14,
            color: selected ? 'var(--color-voltage-violet)' : 'var(--color-midnight-ink)',
          }}>
            {addon.name}
          </span>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
            color: selected ? 'var(--color-voltage-violet)' : 'var(--color-graphite)',
            whiteSpace: 'nowrap',
          }}>
            +{addon.priceDisplay}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-slate)', lineHeight: 1.5, margin: 0 }}>
          {addon.description}
        </p>
      </div>
    </button>
  );
}

export default function AddonsStep({ onNext, onBack }: Props) {
  const allAddons         = useAppStore(selectAddons);
  const selectedService   = useAppStore(s => s.selectedService);
  const selectedAddonIds  = useAppStore(s => s.selectedAddonIds);
  const toggleAddon       = useAppStore(s => s.toggleAddon);
  const boot              = useAppStore(s => s.boot);

  // Filter to addons relevant for this service
  const serviceAddons = allAddons.filter(a =>
    a.isActive &&
    (a.serviceIds.length === 0 || a.serviceIds.includes(selectedService?.id ?? ''))
  ).sort((a, b) => a.order - b.order);

  // Is this a popular-tier service?
  const isPopularService = !!boot?.pricing.find(
    p => p.serviceId === selectedService?.id && p.isPopular
  );

  // Calculate total add-on price
  const selectedAddons = serviceAddons.filter(a => selectedAddonIds.includes(a.id));
  const addonsTotal    = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const basePricing    = boot?.pricing.find(p => p.serviceId === selectedService?.id);
  const basePrice      = basePricing?.price ?? 0;
  const totalPrice     = basePrice + addonsTotal;
  const currencySymbol = boot?.config.currencySymbol ?? '₹';

  const formatPrice = (paise: number) =>
    `${currencySymbol}${(paise / 100).toLocaleString('en-IN')}`;

  if (serviceAddons.length === 0) {
    // No add-ons for this service — skip straight through
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
        <p style={{ fontSize: 15, color: 'var(--color-slate)', marginBottom: 28 }}>
          No optional add-ons for this service.
        </p>
        <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={onNext}>
          Continue to Verification →
        </button>
        <button
          onClick={onBack}
          style={{ marginTop: 12, fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, marginBottom: 6 }}>
          Enhance Your Session
        </h3>
        <p style={{ fontSize: 13, color: 'var(--color-slate)', lineHeight: 1.6 }}>
          {isPopularService
            ? 'We\'ve pre-selected our most popular add-ons. Customise as you like.'
            : 'Add optional extras to get more from your session.'}
        </p>
      </div>

      {isPopularService && selectedAddonIds.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
          padding: '8px 14px',
          background: 'var(--color-lavender-field)',
          borderRadius: 10,
          fontSize: 12,
          color: 'var(--color-ultra-violet)',
          fontWeight: 500,
        }}>
          <span>✦</span>
          <span>Popular add-ons pre-selected for this package</span>
        </div>
      )}

      {/* Add-on list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {serviceAddons.map(addon => (
          <AddonCard
            key={addon.id}
            addon={addon}
            selected={selectedAddonIds.includes(addon.id)}
            onToggle={() => toggleAddon(addon.id)}
          />
        ))}
      </div>

      {/* Order summary */}
      <div style={{
        background: 'var(--color-fog)',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--color-graphite)' }}>
            {basePricing?.label ?? selectedService?.name}
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-graphite)' }}>
            {basePricing?.priceDisplay}
          </span>
        </div>
        {selectedAddons.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--color-slate)' }}>+ {a.name}</span>
            <span style={{ fontSize: 12, color: 'var(--color-slate)' }}>+{a.priceDisplay}</span>
          </div>
        ))}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          borderTop: '1px solid var(--color-mist)', marginTop: 10, paddingTop: 10,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Total</span>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
            color: 'var(--color-voltage-violet)',
          }}>
            {formatPrice(totalPrice)}
          </span>
        </div>
      </div>

      <button
        className="btn btn-primary w-full mb-10"
        style={{ justifyContent: 'center', fontSize: 15 }}
        onClick={onNext}
      >
        Continue →
      </button>
      <button
        onClick={onBack}
        style={{ fontSize: 13, color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'center' }}
      >
        ← Back
      </button>
    </div>
  );
}