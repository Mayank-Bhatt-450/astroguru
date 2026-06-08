// src/components/islands/BookNowButton.tsx
// ============================================================
// Reusable "Book Now" button island.
// Drop this anywhere on any page/section:
//
//   <BookNowButton client:load serviceId="astrology" label="Book Astrology" />
//
// When clicked it opens the ServicePickerModal pre-filtered to serviceId.
// If serviceId is omitted, the first active service is pre-selected.
// ============================================================

import { useAppStore } from '../../stores/appStore';

interface Props {
  serviceId?: string;
  label?:     string;
  variant?:   'primary' | 'dark' | 'ghost';
  size?:      'sm' | 'md' | 'lg';
  className?: string;
}

export default function BookNowButton({
  serviceId,
  label     = 'Book a Session',
  variant   = 'primary',
  size      = 'md',
  className = '',
}: Props) {
  const openServicePicker = useAppStore(s => s.openServicePicker);

  const padding = { sm: '8px 18px', md: '12px 24px', lg: '16px 32px' }[size];
  const fontSize = { sm: 13, md: 15, lg: 17 }[size];

  return (
    <button
      className={`btn btn-${variant} ${className}`}
      style={{ padding, fontSize, justifyContent: 'center' }}
      onClick={() => openServicePicker(serviceId)}
    >
      {label}
    </button>
  );
}
