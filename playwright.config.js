import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/ship-log-map/',
    reuseExistingServer: true,
    timeout: 30000,
  },
  reporter: 'list',
});
