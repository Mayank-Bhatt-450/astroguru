// src/components/islands/DevModeBadge.tsx
// Renders a persistent yellow badge in the bottom-left corner
// when PUBLIC_SKIP_PAYMENT=true so developers always know they
// are not in a real-payment environment.
// Renders nothing in production.

import { SKIP_PAYMENT } from '../../lib/flags';

export default function DevModeBadge() {
  if (!SKIP_PAYMENT) return null;
  return (
    <div className="dev-bypass-badge">
      ⚠ Dev — Payment Skipped
    </div>
  );
}
