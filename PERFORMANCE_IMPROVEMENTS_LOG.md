# Performance Improvements Log

Running record of perf findings, changes, and measured impact. Each entry includes the problem, fix, bundle/benchmark delta, and commit SHA.

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
