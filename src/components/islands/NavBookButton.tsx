// src/components/islands/NavBookButton.tsx
// Tiny React island — just the nav "Book a Session" CTA.
// Must be a React island so it can access the Zustand store.

import { useAppStore } from '../../stores/appStore';

export default function NavBookButton() {
  const openServicePicker = useAppStore(s => s.openServicePicker);
  return (
    <button
      className="btn btn-primary btn-nav"
      onClick={() => openServicePicker()}
      style={{ whiteSpace: 'nowrap' }}
    >
      Book a Session
    </button>
  );
}
