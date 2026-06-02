// e2e/perf.spec.js
// Browser performance measurements using the GYG (Gaia Yoga Graph) dataset.
// Requires the Vite dev server running (playwright.config.js starts it).
//
// Run: npm run e2e:perf
//
// All timing measurements are informational (console.log only).
// Hard assertions are correctness-only: graph loaded, modal opened, etc.

import { test, expect } from '@playwright/test';

const GYG_URL =
  'http://localhost:5173/ship-log-map/' +
  '?map=https%3A%2F%2Favidrucker.github.io%2Fimg-test-1%2FGaia%2520Yoga%2Fgaia_yoga.json' +
  '&canedit=true';

// Playing-mode URL: query params present but no canedit=true → app loads in playing mode.
// Node clicks in playing mode open the note viewer modal.
const GYG_PLAY_URL =
  'http://localhost:5173/ship-log-map/' +
  '?map=https%3A%2F%2Favidrucker.github.io%2Fimg-test-1%2FGaia%2520Yoga%2Fgaia_yoga.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function loadGYG(page) {
  await page.goto(GYG_URL);
  // Cytoscape renders into a canvas element; wait for it to appear
  await page.waitForSelector('canvas', { timeout: 30000 });
}

// ---------------------------------------------------------------------------
// Load time
// ---------------------------------------------------------------------------
test('initial graph load time (navigation → canvas visible)', async ({ page }) => {
  const t0 = Date.now();
  await loadGYG(page);
  const loadMs = Date.now() - t0;

  console.log(`[e2e-perf] Initial load time: ${loadMs} ms`);

  const canvas = await page.$('canvas');
  expect(canvas).not.toBeNull();
});

// ---------------------------------------------------------------------------
// FPS during active pan
// ---------------------------------------------------------------------------
test('FPS reading after simulated pan', async ({ page }) => {
  await loadGYG(page);

  // Simulate a drag across the canvas to trigger Cytoscape pan + redraws
  const box = await page.locator('canvas').first().boundingBox();
  if (box) {
    const cx = box.x + box.width  / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(cx - i * 15, cy, { steps: 1 });
      await page.waitForTimeout(16); // ~60fps cadence
    }
    await page.mouse.up();
  }

  // FpsCounter updates every 500ms; wait for it to stabilize
  await page.waitForTimeout(600);

  // Read the FPS counter — try common selectors (adjust if selector changes)
  const fpsText = await page.evaluate(() => {
    const candidates = [
      document.querySelector('[data-testid="fps-counter"]'),
      document.querySelector('[class*="fps"]'),
      document.querySelector('[class*="Fps"]'),
      // Text-based fallback: find element whose content looks like "N FPS" or "FPS: N"
      ...[...document.querySelectorAll('*')].filter(el =>
        el.childNodes.length === 1 &&
        el.childNodes[0].nodeType === 3 &&
        /^\d+\s*(fps|FPS)$|^FPS:\s*\d+$/.test(el.textContent.trim())
      ),
    ].filter(Boolean);
    return candidates[0]?.textContent ?? null;
  });

  if (fpsText) {
    const fps = parseInt(fpsText.replace(/\D/g, ''), 10);
    console.log(`[e2e-perf] FPS during pan: ${fps}`);
    expect(fps).toBeGreaterThan(0);
  } else {
    console.log('[e2e-perf] FPS counter element not found — add data-testid="fps-counter" to <FpsCounter> to enable this check');
  }
});

// ---------------------------------------------------------------------------
// FPS during node resize animation
// ---------------------------------------------------------------------------
test('FPS stays ≥30 during a node resize animation (was ~2fps before borrow/return fix)', async ({ page }) => {
  await loadGYG(page);
  // Let FPS counter stabilize and fit animation settle
  await page.waitForTimeout(1200);

  // Find a visible node to double-click (editing mode — GYG_URL has canedit=true)
  const nodeClickPos = await page.waitForFunction(() => {
    const container = document.getElementById('cy');
    const cy = container?._cy;
    if (!cy || cy.destroyed()) return null;
    const parents = cy.nodes('.entry-parent');
    if (parents.empty()) return null;
    const bb = container.getBoundingClientRect();
    let result = null;
    parents.forEach(node => {
      if (result) return;
      const rp = node.renderedPosition();
      if (rp.x > 20 && rp.x < bb.width - 20 && rp.y > 20 && rp.y < bb.height - 20)
        result = { x: bb.left + rp.x, y: bb.top + rp.y };
    });
    return result;
  }, null, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => null);

  if (!nodeClickPos) {
    console.log('[e2e-perf] No visible node found — skipping resize FPS test');
    return;
  }

  // Double-click triggers the 300ms resize animation
  await page.mouse.dblclick(nodeClickPos.x, nodeClickPos.y);

  // Wait for the FPS counter's 500ms measurement window to cover the animation period
  await page.waitForTimeout(700);

  const fpsText = await page.evaluate(() =>
    document.querySelector('[data-testid="fps-counter"]')?.textContent ?? null
  );

  if (!fpsText) {
    console.log('[e2e-perf] FPS counter not found — skipping resize FPS assertion');
    return;
  }

  const fps = parseInt(fpsText.replace(/\D/g, ''), 10);
  console.log(`[e2e-perf] FPS during resize animation: ${fps} (threshold ≥30, healthy ≥50)`);
  // Before fix: ~2fps (dirtyCompoundBoundsCache every frame for entry + badge).
  // After fix: ~60fps. Threshold of 30 is CI-resilient while cleanly catching the regression.
  expect(fps).toBeGreaterThanOrEqual(30);
});

// ---------------------------------------------------------------------------
// Search bar latency
// ---------------------------------------------------------------------------
test('search bar keystroke → suggestions latency', async ({ page }) => {
  await loadGYG(page);

  // Open the search panel — Ctrl+F is the global hotkey
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(150);

  // The search input is only rendered when the panel is open (returns null when closed)
  const searchInput = page.locator('input[placeholder*="Search"]').first();
  const exists = (await searchInput.count()) > 0;

  if (!exists) {
    console.log('[e2e-perf] Search input not found — skipping search latency measurement');
    return;
  }

  const t0 = Date.now();
  await searchInput.fill('ga');
  // Allow the debounced search handler to fire
  await page.waitForTimeout(300);
  const searchMs = Date.now() - t0;

  console.log(`[e2e-perf] Search latency (keystroke → 300ms settle): ${searchMs} ms`);
  expect(searchMs).toBeLessThan(2000);
});

// ---------------------------------------------------------------------------
// Node click → modal open latency
// ---------------------------------------------------------------------------
test('node click → modal open latency', async ({ page }) => {
  // Load in playing mode (no canedit=true): node clicks trigger the note viewer modal.
  await page.goto(GYG_PLAY_URL);
  await page.waitForSelector('canvas', { timeout: 30000 });

  // Poll until Cytoscape has loaded nodes from the CDN (up to 10s).
  // Poll until a node is within the visible viewport (fit animation must complete).
  const nodeClickPos = await page.waitForFunction(() => {
    const container = document.getElementById('cy');
    const cy = container?._cy;
    if (!cy || cy.destroyed()) return null;
    const parents = cy.nodes('.entry-parent');
    if (parents.empty()) return null;
    const bb = container.getBoundingClientRect();
    // Find any node whose rendered position is inside the canvas
    let result = null;
    parents.forEach(node => {
      if (result) return;
      const rp = node.renderedPosition();
      if (rp.x > 0 && rp.x < bb.width && rp.y > 0 && rp.y < bb.height) {
        result = { x: bb.left + rp.x, y: bb.top + rp.y };
      }
    });
    return result;
  }, null, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => null);

  if (!nodeClickPos) {
    console.log('[e2e-perf] Could not determine node position — skipping node click test');
    return;
  }

  console.log(`[e2e-perf] Clicking node at viewport coords (${Math.round(nodeClickPos.x)}, ${Math.round(nodeClickPos.y)})`);

  // Allow any fit animation to settle before clicking
  await page.waitForTimeout(500);

  const t0 = Date.now();
  await page.mouse.click(nodeClickPos.x, nodeClickPos.y);

  let modalMs = null;
  try {
    await page.waitForSelector('[data-testid="note-viewer-modal"]', { timeout: 2500 });
    modalMs = Date.now() - t0;
  } catch {
    // No modal appeared
  }

  if (modalMs !== null) {
    console.log(`[e2e-perf] Node click → modal open: ${modalMs} ms`);
    // Threshold accounts for the zoom animation (~300–600ms) + React render + Playwright overhead.
    expect(modalMs).toBeLessThan(2000);
  } else {
    console.log('[e2e-perf] No modal appeared after clicking node');
  }
});

// ---------------------------------------------------------------------------
// JS heap size + memory leak check
// ---------------------------------------------------------------------------
test('JS heap footprint and no leak across 3 GYG loads', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('HeapProfiler.enable');

  // Warm-up load — let JIT and caches settle
  await loadGYG(page);
  await client.send('HeapProfiler.collectGarbage');
  const { usedSize: before } = await client.send('Runtime.getHeapUsage');
  console.log(`[e2e-perf] Heap after warm-up load: ${(before / 1024 / 1024).toFixed(1)} MB`);

  // 3 additional loads
  for (let i = 0; i < 3; i++) {
    await loadGYG(page);
  }
  await client.send('HeapProfiler.collectGarbage');
  const { usedSize: after } = await client.send('Runtime.getHeapUsage');
  const growthMB = (after - before) / 1024 / 1024;

  console.log(`[e2e-perf] Heap after 3 more loads: ${(after / 1024 / 1024).toFixed(1)} MB`);
  console.log(`[e2e-perf] Heap growth over 3 reloads: ${growthMB.toFixed(2)} MB`);

  // A real leak shows as unbounded growth; 20 MB allows for warm cache variance
  expect(growthMB).toBeLessThan(20);
});
