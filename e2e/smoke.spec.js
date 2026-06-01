// e2e/smoke.spec.js
// Startup smoke test — verifies the app mounts without a JS crash.
//
// Catches runtime errors that pass the build (e.g. TDZ ReferenceError from
// hook call ordering). Runs against the dev server (playwright.config.js
// starts it automatically).
//
// Run: npm run e2e:smoke

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/ship-log-map/';

test('app loads without a JS crash', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto(BASE_URL);

  // Cytoscape renders into a <canvas>; waiting for it proves React mounted
  // the component tree successfully (ErrorBoundary would replace it on crash).
  await page.waitForSelector('canvas', { timeout: 15000 });

  // No uncaught JS exceptions (ReferenceError, TypeError, etc.)
  expect(pageErrors, `JS errors on load:\n${pageErrors.join('\n')}`).toEqual([]);

  // ErrorBoundary fallback must not be visible
  await expect(page.getByText('Something went wrong in the App component.')).not.toBeVisible();
});
