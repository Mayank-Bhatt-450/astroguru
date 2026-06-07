// src/components/islands/AppBootstrap.tsx
// Invisible island that bootstraps the app store on client load.
// Must render before any data-dependent components.

import { useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';

export default function AppBootstrap() {
  const loadBoot = useAppStore(s => s.loadBoot);

  useEffect(() => {
    loadBoot();
  }, [loadBoot]);

  // Renders nothing — pure side effect
  return null;
}
