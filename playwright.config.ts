import { defineConfig } from '@playwright/test';

// UWAGA: E2E chodzi na buildzie produkcyjnym — `npm run build` wykonuje
// CI/developer PRZED `npm run test:e2e` (webServer nie buduje sam).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4599',
  },
  webServer: {
    command: 'rm -f data/e2e.db && node dist/server/entry.mjs',
    url: 'http://127.0.0.1:4599/login',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_FILE: 'data/e2e.db',
      MOCK_AI: '1',
      PORT: '4599',
      HOST: '127.0.0.1',
    },
  },
});
