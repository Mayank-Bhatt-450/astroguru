// astro.config.mjs
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server', // SSR for API routes + static pages
  adapter: node({ mode: 'standalone' }),
  integrations: [
    react(),
  ],
  vite: {
    define: {
      // Expose only safe public env vars to client
      'import.meta.env.PUBLIC_GAS_URL': JSON.stringify(process.env.PUBLIC_GAS_URL),
      'import.meta.env.PUBLIC_RAZORPAY_KEY': JSON.stringify(process.env.PUBLIC_RAZORPAY_KEY),
      'import.meta.env.DEV_MODE': JSON.stringify(process.env.NODE_ENV === 'development'),
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'zustand', 'react-hook-form', 'zod'],
    },
  },
  // Prerender static marketing pages at build time
  prefetch: true,
});
