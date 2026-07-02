// src/components/islands/AppBootstrap.tsx
// Invisible island that bootstraps the app store on client load.
// Also bridges the mobile nav "Book a Session" button (plain HTML element)
// to the Zustand store's openServicePicker action via a custom event.

import { useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';

export default function AppBootstrap() {
  const loadBoot          = useAppStore(s => s.loadBoot);
  const openServicePicker = useAppStore(s => s.openServicePicker);

  useEffect(() => {
    loadBoot();
  }, [loadBoot]);

  // Bridge the static mobile nav button to the React store
  useEffect(() => {
    const handler = () => openServicePicker();
    window.addEventListener('astroguru:openServicePicker', handler);
    return () => window.removeEventListener('astroguru:openServicePicker', handler);
  }, [openServicePicker]);

  return null;
}