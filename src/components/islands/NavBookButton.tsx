// src/components/islands/NavBookButton.tsx
// Tiny React island — nav "Book a Session" CTA.
// On desktop: renders as a primary pill button.
// When placed inside mobile-menu (via JS injection in BaseLayout),
// the .mobile-book-btn class gives it the plain nav-link appearance.

import { useAppStore } from '../../stores/appStore';

interface Props {
  id?: string;
}

export default function NavBookButton({ id }: Props) {
  const openServicePicker = useAppStore(s => s.openServicePicker);
  return (
    <button
      id={id}
      className="btn btn-primary btn-nav"
      onClick={() => openServicePicker()}
      style={{ whiteSpace: 'nowrap' }}
      aria-label="Book a consultation session"
    >
      Book a Session
    </button>
  );
}