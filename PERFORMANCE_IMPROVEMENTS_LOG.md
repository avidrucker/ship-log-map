# Performance Improvements Log

Running record of perf findings, changes, and measured impact. Each entry includes the problem, fix, bundle/benchmark delta, and commit SHA.

---

## Session 5 — 2026-06-01

### PERF-4 — Harden resize-animation borrow/return (smooth badge transition)
**Commits:** `9f777ab`, `51bce53`
**Files changed:** `src/styles/tokens.js`, `src/cytoscapeStyles.js`, `src/graph/overlayManager.js`, `src/App.jsx`

**Problem:** The borrow/return pattern (detach badge → CSS transition → reattach) had two failure modes:
1. Rapid double-clicks: the 350ms setTimeout from the first click could fire *after* a second resize started, calling `endNodeResizeAnimation` at the wrong moment and briefly orphaning the badge.
2. Timing drift: the CSS `transition-duration: '300ms'` string and the `setTimeout(350)` magic number were independent literals — changing one without the other would silently break the animation.

A drag guard was also missing: if a node was grabbed while the badge was detached (standalone), it would stay on the main canvas instead of riding the drag-canvas layer, making it appear to disappear under the dragged node.

**Fix:**
- `tokens.js`: export `RESIZE_TRANSITION_MS = 300` — single source of truth for both CSS and JS.
- `cytoscapeStyles.js`: drive `transition-duration` for badge and entry-node from the token (template literal).
- `overlayManager.js` `startNodeResizeAnimation`: skip detach when `cy.scratch('_overlay_dragging')` is truthy — badge stays compound during simultaneous drag + resize.
- `App.jsx` `handleNodeDoubleClick`: add `resizeTimersRef` (`Map<nodeId, timerId>`). On each double-click, cancel the prior timer for that node and force-reattach the badge before starting a new animation. Timeout driven from `RESIZE_TRANSITION_MS + 60ms`.

**Measured:** Smooth badge font-size + text-margin-y transition on double-click confirmed visually. Rapid triple-click stable (no ghost timer). Drag FPS unaffected.

---

### BUG-1 fix — Unseen badge misposition after node resize
**Commit:** `9f777ab`
**File:** `src/graph/overlayManager.js` — `attach()`

`attach()` now registers `cy.on('data', 'node.entry-parent', onNodeData)` so unseen badges at the top-right corner reposition immediately when node size data changes, without waiting for the next drag or React re-render.

---

### Contract tests — cytoscapeStyles + overlayManager
**Commit:** `9f777ab`
**Files:** `src/cytoscapeStyles.test.js`, `src/graph/overlayManager.test.js`

Added two test files locking in:
- Badge CSS transition properties (font-size + text-margin-y only, not width/height; duration matches entry-node).
- `attach()`/`detach()` event-listener contract (data listener on entry-parent, no bare-node listeners, idempotent, exact handler cleanup).
- Compound-child badge contract (badge created with `parent: hostId`, stores `hostId` for resilient lookup).
- Borrow/return contract (detach → reattach sequence, drag-guard skip).

100/100 tests passing.

---

## Session 4 — 2026-06-01

### PERF-1 — Lazy-load CytoscapeGraph / Cytoscape.js
**Commit:** `1c6a7bd`  
**File changed:** `src/App.jsx`

**Problem:** Cytoscape.js was 52% of the JS bundle (248 KB gzip), statically imported via `CytoscapeGraph.jsx`. This blocked parse/eval before first render on every page load.

**Fix:** Two-line change in `App.jsx`:
- Replaced `import CytoscapeGraph from "./components/CytoscapeGraph.jsx"` with `React.lazy(() => import(...))`
- Wrapped `<CytoscapeGraph>` in `<Suspense fallback={<spinner />}>`

Vite now splits `cyAdapter.js` (which contains Cytoscape) into its own async chunk, loaded only after first paint.

**Impact:**

| Metric | Before | After | Delta |
|---|---|---|---|
| main.js gzip | 254.1 KB | 101.2 KB | **-153 KB (-60%)** |
| CytoscapeGraph chunk | (in main) | 3.7 KB gzip | deferred |
| cyAdapter chunk | (in main) | 150.1 KB gzip | deferred |

**Bonus fix:** Three curly-quote (Unicode `'`/`'`) string literals in `App.jsx` were silently preventing `npm run build` from succeeding. Replaced with straight quotes.

**Tests:** 82/82 passing.

---

### QUAL-2 — `buildElementsFromDomain` intermediate array allocation
**Commit:** `fb73383`  
**File changed:** `src/graph/cyAdapter.js`

**Problem:** `g.nodes.map(n => [...]).flat()` created N temporary 2-element arrays (one parent + one entry-child object per node) and then `.flat()` traversed them all again. For 500 nodes: 500 wasted allocations + GC pressure.

**Fix:** Pre-allocate `nodes = []`, switch `map` → `forEach`, and `return [a, b]` → `nodes.push(a, b)`. Single-pass, zero intermediate arrays.

**Impact:** Micro-optimization; most visible on maps with 200+ nodes during initial mount and sync calls.

---

### QUAL-3 — `updateOverlays` O(n) Cytoscape DOM queries
**Commit:** `fb73383`  
**File changed:** `src/graph/cyAdapter.js` — `updateOverlays()`

**Problem:** For each note entry, `cy.getElementById(id)` was called to determine whether the ID belongs to a node or an edge — one Cytoscape internal DOM traversal per note, scaling linearly with note count.

**Fix:** Pre-build two Sets once — `cyNodeIds` from `cy.nodes(':parent')` and `cyEdgeIds` from `cy.edges()` — then use `Set.has()` (O(1)) inside the loop. Total Cytoscape queries: 2 instead of N.

**Impact:** Reduces per-overlay-update cost from O(n_notes × cy_lookup) to O(n_nodes + n_edges + n_notes). Noticeable on maps with 50+ annotated nodes/edges.

**Tests:** 82/82 passing.

---

### PERF-2 (alt) — `hydrateCoordsIfMissing` linear scan → Map lookup
**Commit:** `63ab7b5`  
**File changed:** `src/utils/mapHelpers.js`

**Problem:** `.find()` per CDN node did a linear scan through the default graph for each node missing coordinates.

**Fix:** Pre-built `defaultById` and `defaultByTitle` Maps before the loop; replaced `.find()` with `Map.get()` (O(1)).

**Note on full Worker approach:** The normalization functions are fast pure transforms on plain JSON. A Worker adds async complexity without meaningful payoff for current map sizes. PERF-3 (WebP encoding) is the more valuable Worker candidate.

---

### syncElements — data-update path: Map lookup + batch wrapper
**Commit:** `63ab7b5`  
**File changed:** `src/graph/cyAdapter.js` — `syncElements()` no-structural-change branch

**Problem:** When graph structure doesn't change (the common case: note edits, image loads, mode changes), `syncElements` called `cy.getElementById()` per element with no batch wrapper — each `.data()` write triggered a Cytoscape style recalc immediately.

**Fix:**
1. Pre-built a single `eleById` Map (one `cy.elements().forEach`) replacing N individual `cy.getElementById()` calls.
2. Wrapped all `.data()` writes in `cy.startBatch()` / `cy.endBatch()` to collapse N style recalcs into one.

**Impact:** Hot path — runs on every non-structural state change. Batching eliminates N intermediate style passes per update cycle.

**Tests:** 82/82 passing.

---

### CytoscapeGraph position-update — batch + Map
**Commit:** `463da4b`  
**File changed:** `src/components/CytoscapeGraph.jsx` — position-only branch of sync effect

**Problem:** Position-only updates called `cy.getElementById()` per node individually and wrote positions one-at-a-time without a batch, triggering a layout recalc per write.

**Fix:** Pre-built `cyNodeById` Map from `.entry-parent` nodes; wrapped all `node.position()` writes in `cy.startBatch()` / `cy.endBatch()`.

**Tests:** 82/82 passing.

---

### UX-1 — Node click → modal latency E2E test (now measuring real data)
**Commit:** `524a5f2`  
**Files:** `e2e/perf.spec.js`, `src/components/NoteViewerModal.jsx`, `src/components/CytoscapeGraph.jsx`

**Problem:** The test always skipped because clicking the canvas center missed all nodes (Cytoscape hit-tests the canvas, not DOM elements).

**Fix:**
1. `CytoscapeGraph` now exposes cy on `containerRef.current._cy` after mount.
2. `NoteViewerModal` gets `data-testid="note-viewer-modal"` for a reliable Playwright selector.
3. Test uses `page.waitForFunction()` polling `cy.nodes('.entry-parent')` + viewport-bounds check, then clicks the exact `renderedPosition()`.
4. Loads in playing-mode URL (no `canedit=true`) so node taps open the note viewer.

**Measured baseline:** ~969ms click→modal (dominated by the zoom animation, ~300–600ms). Threshold set to 2000ms.

---

### CytoscapeGraph sync effect — string-key fingerprint (drag-frame optimization)
**Commit:** `7ab9b20`  
**File changed:** `src/components/CytoscapeGraph.jsx` — domain sync effect + memos

**Problem:** `nodesFingerprint` created N objects every render (including every drag frame). The sync effect then built `currentNodesMap` from Cytoscape (N element reads + N small object allocations) and compared N fields to distinguish structural vs position-only changes. This ran on every drag frame even when no structure changed.

**Fix:** Replaced `nodesFingerprint`/`edgesFingerprint` arrays with `nodesKey`/`edgesKey` strings — `Array.join()` of structural fields only (id, title, size, color, imageUrl — no positions). A `prevNodesKeyRef` stores the last key; if unchanged, the effect skips all Map building and goes straight to the batched position update.

**Impact (drag frames, the common hot path):**
- Before: O(N) object alloc (memo) + O(N) cy-reads + O(N) comparisons + O(N) position update
- After: O(N) string join (memo) + O(1) ref compare + O(N) position update

Also saves N intermediate Map entries per drag frame.

**Tests:** 82/82 passing.

---
