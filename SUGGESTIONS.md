# Suggestions & Future Work

Running list of investigated-but-deferred improvements. Each entry includes the file, the problem, a concrete fix, and the expected payoff.

---

## Performance

### PERF-1 — Lazy-load Cytoscape to improve TTI
**Priority:** High  
**Effort:** 1–2 sessions  
**File:** `src/components/CytoscapeGraph.jsx`, `src/graph/cyAdapter.js`

Cytoscape is 52% of the JS bundle (248 KB gzip). It's statically imported, blocking parse/eval before first render. The static+dynamic import conflict in `cyAdapter.js` prevents Rollup from splitting it.

**Fix:**
1. Change `CytoscapeGraph.jsx`'s import of `cyAdapter` to a dynamic `import()`
2. Remove the redundant dynamic import in `App.jsx` (CytoscapeGraph already does it)
3. Wrap `<CytoscapeGraph>` in `React.lazy()` + `<Suspense fallback={<LoadingSpinner />}>`

**Impact:** ~248 KB gzip deferred past first render → measurable TTI on mobile/slow connections.

---

### PERF-2 — Web Worker for graph normalization on large CDN loads
**Priority:** Medium  
**Effort:** 1 session  
**File:** `src/utils/cdnHelpers.js`, `src/hooks/useMapLoading.js`

`normalizeGraphData()` and `hydrateCoordsIfMissing()` run synchronously on the main thread after a CDN fetch. For large maps (500+ nodes), this can freeze the UI for hundreds of milliseconds.

**Fix:** Move normalization into a Worker via `new Worker(new URL('./normalizeWorker.js', import.meta.url))`. Post the raw parsed JSON to the worker, receive the normalized graph back.

**Note:** Requires serialization across the Worker boundary — no functions or class instances can be passed, only plain data. Verify that the graph objects are fully serializable before attempting this.

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

### QUAL-2 — `buildElementsFromDomain` intermediate array allocation
**Priority:** Low  
**File:** `src/graph/cyAdapter.js` — `buildElementsFromDomain()`

Each node generates a parent + entry child element. The current code uses `.map()` returning nested arrays + `.flat()`, creating two intermediate arrays per node. For 500 nodes this is 1,000 element-object allocations + two GC-able arrays.

**Fix:** Pre-allocate a result array (`const result = []; nodes.forEach(n => { result.push(...buildNode(n)) })`) to avoid the intermediate array from `.flat()`.

---

### QUAL-3 — `overlayManager` O(n) Cytoscape lookups for notes
**Priority:** Low  
**File:** `src/graph/cyAdapter.js` — `updateOverlays()`

`Object.entries(notes).forEach(([id]) => cy.getElementById(id))` does one Cytoscape lookup per note. For maps with hundreds of notes this is O(n) individual DOM queries.

**Fix:** Pre-collect all overlay nodes once with `cy.nodes('.note-count')`, build a Map of them, then update from that Map without further DOM lookups.

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
