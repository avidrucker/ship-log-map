# Suggestions & Future Work

Running list of investigated-but-deferred improvements. Each entry includes the file, the problem, a concrete fix, and the expected payoff.

---

## Performance

### ~~PERF-1 — Lazy-load Cytoscape to improve TTI~~ ✅ Fixed `1c6a7bd`
**Priority:** High  
**Effort:** 1–2 sessions  
**File:** `src/App.jsx`

`React.lazy()` + `<Suspense>` wraps `<CytoscapeGraph>` in App.jsx. Vite now splits cyAdapter (Cytoscape.js) into its own async chunk. Main bundle: 254 KB → 101 KB gzip; Cytoscape (150 KB gzip) deferred past first paint.

---

### ~~PERF-2 — Web Worker for graph normalization~~ ✅ Addressed `63ab7b5` (alt approach)
**Priority:** Medium  
**File:** `src/utils/mapHelpers.js`, `src/graph/cyAdapter.js`

Worker deemed not cost-effective for these functions (pure O(n) JSON transforms, fast enough for current map sizes). Instead:
- `hydrateCoordsIfMissing`: replaced `.find()` linear scan with pre-built id/title Maps (O(1) lookup)
- `syncElements` data-update path: added `eleById` Map + `cy.startBatch()/endBatch()` — bigger real-world win

PERF-3 (WebP encoding) remains the more valuable Worker candidate.

---

### PERF-3 — Move Cytoscape image loading off the main thread (long-running)
**Priority:** Low  
**Effort:** Multi-session  
**File:** `src/hooks/useMapLoading.js:143`

`dataUrlOrBlobToWebpDataUrl()` is CPU-intensive WebP encoding that runs synchronously during CDN loads. Could be moved to a Worker or an `OffscreenCanvas`.

---

## Code Correctness / Quality

### QUAL-1 — Fix 3 deferred code-review findings from Session 1
**Priority:** Medium  
**Files:** Listed below

These were confirmed issues identified in the original code review but explicitly deferred:

| Finding | File | Issue | Fix |
|---|---|---|---|
| Q1a | `src/hooks/useGraphOperations.js:298` | ~~Cytoscape fit() inside state updater~~ | ✅ **Fixed in Session 3 (T1-D)** |
| Q1b | `src/App.jsx:1024` | ~~setTimeout inside state updater~~ | ✅ **Fixed in Session 3 (T2-B)** |
| Q1c | `src/App.jsx:1244` | ~~6 identity useMemo wrappers~~ | ✅ **Fixed in Session 3 (T1-A)** |

All three deferred findings have now been addressed. This entry is kept for reference.

---

### ~~QUAL-2 — `buildElementsFromDomain` intermediate array allocation~~ ✅ Fixed `fb73383`
**Priority:** Low  
**File:** `src/graph/cyAdapter.js` — `buildElementsFromDomain()`

Replaced `.map().flat()` with pre-allocated array + `forEach`/`push`. Eliminates N temporary 2-element arrays per call.

---

### ~~QUAL-3 — `overlayManager` O(n) Cytoscape lookups for notes~~ ✅ Fixed `fb73383`
**Priority:** Low  
**File:** `src/graph/cyAdapter.js` — `updateOverlays()`

Pre-built `cyNodeIds` / `cyEdgeIds` Sets from two bulk queries; replaced per-note `cy.getElementById()` with O(1) `Set.has()` lookups.

---

## UX / Feature

### UX-1 — E2E: node click → modal latency not yet measured
**Priority:** Low  
**File:** `e2e/perf.spec.js`

The `node click → modal open latency` E2E test always skips because the canvas click lands on empty space (Cytoscape renders on canvas, coordinates are opaque to Playwright). 

**Fix:** Query Cytoscape's `cy.nodes().first().renderedPosition()` via `page.evaluate()` and click that exact pixel. This gives a reliable hit on the first node without hardcoding coordinates.

---

## Architecture

### ARCH-1 — App.jsx component split
**Priority:** Medium (maintenance)  
**File:** `src/App.jsx` (1,592 lines)

App.jsx owns too much: graph state, camera state, modal state, CDN loading, note editing, undo, persistence, search, event handling, and render. This makes it hard to reason about what causes re-renders.

**Suggested split:**
- `GraphDataProvider` — owns `graphData`, `graphOps`, persistence
- `UIStateProvider` — owns modal state, selections, undo
- `App` — composition root, owns layout/render only

This is a large refactor; do it incrementally (one context at a time) to avoid breaking things.

---

## How to Use This Doc

- Pick items by priority when planning a new session
- Mark items ✅ when completed (with commit SHA)
- Add new findings here rather than letting them drift into chat history
