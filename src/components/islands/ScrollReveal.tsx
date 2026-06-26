// src/components/islands/ScrollReveal.tsx
// Invisible island that activates scroll-reveal animations on any page.
// Drop <ScrollReveal client:load /> anywhere in a layout to enable.
// (BaseLayout already includes this via inline script; use this island
//  for pages that want finer-grained control.)

import { useEffect } from 'react';

export default function ScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    const observe = () =>
      document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));

    observe();
    const t1 = setTimeout(observe, 500);
    const t2 = setTimeout(observe, 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      observer.disconnect();
    };
  }, []);

  return null;
}