// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',

  security: {
    // Za reverse proxy (nginx) Astro buduje URL żądania z tego, co widzi na
    // gnieździe (http://127.0.0.1:4321), a przeglądarka wysyła
    // `Origin: https://cards.focht.pl`. Wbudowana ochrona CSRF (checkOrigin)
    // porównuje te dwa i odrzucała każde DELETE bez content-type jako
    // „cross-site" (403) — usuwanie fiszek nie działało na produkcji, choć
    // lokalnie i w E2E przechodziło. Lista dozwolonych hostów każe Astro ufać
    // X-Forwarded-Proto i nagłówkowi Host dla tych domen (Astro ≥ 5.14).
    allowedDomains: [
      { hostname: 'cards.focht.pl', protocol: 'https' },
      { hostname: 'localhost' },
      { hostname: '127.0.0.1' },
    ],
  },
  integrations: [react()],

  adapter: node({
    mode: 'standalone'
  }),

  vite: {
    plugins: [tailwindcss()]
  }
});