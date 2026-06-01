# Profiling & Optimization Findings — Session 3

Captured 2026-06-01, after the aggressive optimization pass. Documents what was applied, what new items were discovered but not yet fixed, and what's left for future work.

---

## Applied Optimizations (this session, all committed in `6be0b91`)

### T1-A — Remove 6 no-op identity useMemo wrappers
**File:** `src/App.jsx` (removed ~lines 1245–1250)

`memoNodes`, `memoEdges`, `memoSelectedNodeIds`, `memoSelectedEdgeIds`, `memoCameraPosition`, `memoNotes` each returned their dep unchanged. Zero memoization benefit; pure overhead on every render. Replaced all 6 JSX prop sites with direct source values.

---

### T1-B — Note edits no longer trigger full Cytoscape graph sync
**File:** `src/components/CytoscapeGraph.jsx`

Removed `notes` from the large domain-sync effect's deps array. Notes are accessed via `notesRef.current` (kept current by a dedicated `useEffect` at line 692). Previously, every note edit caused `syncElements` to run against the full graph.

---

### T1-C — Selection-sync O(n²) → O(1)
**File:** `src/components/CytoscapeGraph.jsx`

`selectedNodeIds.includes(id)` inside `.every()` was O(n²). Replaced with `new Set(selectedNodeIds)` + `.has()`.

---

### T1-D — Cytoscape DOM mutations moved out of state updater
**File:** `src/hooks/useGraphOperations.js`

`cyInstance.position()` loop and `cyInstance.fit()` were inside `setGraphData(prev => {...})`. State updaters must be pure. Fix: compute `rotated` nodes before calling `setGraphData`, then apply Cytoscape DOM ops after the call.

---

### T1-E — Position-update effect no longer fires on every node change
**File:** `src/App.jsx`

A `useEffect` guarded by `lastActionType === TRIGGER_GRAPH_UPDATE` had `graphData.nodes` in its deps, causing it to run on every node edit (even though the guard prevented useful work). Fixed by introducing `graphDataNodesRef` and removing `graphData.nodes` from the effect's deps.

---

### T2-A — localStorage persistence debounced to 500ms
**File:** `src/App.jsx`

`saveToLocal()` (full graph JSON serialization) fired on every state change, including every keystroke while editing a node title. Now debounced: the write is deferred 500ms after the last change.

---

### T2-B — `setTimeout(0)` hack removed from handleUpdateTitle
**File:** `src/App.jsx`

A `setTimeout(fn, 0)` was used to defer Cytoscape selection sync after a node rename. CytoscapeGraph's selection-sync `useEffect` (which watches `selectedNodeIds`) handles this correctly via React's effect ordering — no manual deferral needed.

---

### T2-C — useHashtagIndex skips rebuild on position-only node changes
**File:** `src/search/useHashtagIndex.js`

The index rebuilt whenever `nodes` changed — including after a drag (position change). Added a `nodesContentKey` / `edgesContentKey` fingerprint (`id|title|notes` per node, joined) via `useMemo`. The rebuild effect now depends on the fingerprints instead of the raw arrays. Position changes don't change the fingerprints, so drags no longer trigger index rebuilds.

**Regression test added:** `src/perf/renderCounts.test.js` — "position-only change does not trigger an index rebuild".

---

### T2-D — searchHighlighter mutations batched into cy.batch()
**File:** `src/search/searchHighlighter.js`

Three chained `setTimeout` calls (100ms → 10ms → 200ms) drove three separate Cytoscape redraws. Collapsed: `unselect` + `select` + `addClass` now run inside a single `cy.batch()` block inside one `setTimeout`. The 10ms intermediate debug check was removed.

---

### T3-A — cyAdapter syncElements: position-restore merged into batch
**File:** `src/graph/cyAdapter.js`

Position-restore was a second full `cy.nodes().forEach()` traversal after the `cy.startBatch()/endBatch()` block. Moved inside the batch (valid — Cytoscape accepts position writes in a batch). Also wrapped the grabbable-state toggle loop in `cy.batch()`.

---

### T3-B — Mode-toggle grabify/ungrabify wrapped in cy.batch()
**File:** `src/components/CytoscapeGraph.jsx`

`cy.nodes().forEach(n => grabify/ungrabify)` on mode change ran as individual DOM operations. Wrapped in `cy.batch()` to collapse into a single Cytoscape redraw.

---

## New Findings (not yet fixed)

### Finding A — `syncElements` compares node/edge ID arrays via JSON.stringify
**File:** `src/graph/cyAdapter.js:495–496`
**Severity:** Medium

```js
const nodesChanged = JSON.stringify(currentNodes) !== JSON.stringify(newNodes);
const edgesChanged = JSON.stringify(currentEdges) !== JSON.stringify(newEdges);
```

Both arrays are pre-sorted and compared by serializing to JSON. For a 500-node graph this is a ~500-char string comparison — not catastrophic, but unnecessary. A simple element-by-element loop comparison (or a hash) would be faster and more readable.

**Recommended fix:** Replace with `arraysEqual(a, b)` — a loop that compares length then each element by index.

---

### Finding B — `existingNodeIds` Set built but used only in the structural-change path
**File:** `src/graph/cyAdapter.js:439`

```js
const existingNodeIds = new Set(cy.nodes('.entry-parent').map(n => n.id()));
```

This traverses all parent nodes on every `syncElements` call, but `existingNodeIds` is only actually used when `nodesChanged || edgesChanged` (inside the structural-change branch, line 512). It's wasted work on the data-only update path (the more common path when nodes/edges haven't been added or removed).

**Recommended fix:** Move the `existingNodeIds` computation inside the `else` branch.

---

### Finding C — SW image cache warming runs `buildFullImageUrl()` on every node change
**File:** `src/App.jsx:638`

The Service Worker cache-warming effect has `graphData.nodes` in its deps. On every node change, it runs `nodes.map(n => n.imageUrl).filter(...)` + `buildFullImageUrl()` for each URL, then `hashList()`. The hash check (`prev === hash`) prevents actual re-warming, but the map/filter/hash computation happens on every drag and every edit.

**Recommended fix:** Move the image URL extraction to a `useMemo` that only re-runs when node IDs or image URLs change (not positions or titles). Pass the memoized list to the cache-warming effect.

---

### Finding D — `isUnseen()` lookup function recreates on every node/edge/visited change
**File:** `src/App.jsx:610`
**Severity:** Low-Medium

```js
const isUnseen = useMemo(
  () => makeVisitedLookup({ nodes: graphData.nodes, edges: graphData.edges, visited }),
  [graphData.nodes, graphData.edges, visited]
);
```

`makeVisitedLookup` builds a lookup function from nodes, edges, and visited state. It recreates on every node/edge change (including drags). Since it depends on `graphData.nodes`, it's subject to the same position-change trigger problem as the old `useHashtagIndex`.

**Recommended fix:** Stabilize with a content fingerprint (node/edge IDs + visited Set), similar to the T2-C fix applied to `useHashtagIndex`.

---

### Finding E — Lazy-loading Cytoscape (structural, not yet attempted)
**File:** `src/components/CytoscapeGraph.jsx` (import) + `src/graph/cyAdapter.js`
**Severity:** High for TTI on slow connections

Cytoscape is 52% of the JS bundle (1,079 KB pre-min / 248 KB gzip). It's statically imported, so it blocks parse and eval before first render. The `cyAdapter.js` module has a static+dynamic import conflict that prevents Rollup from splitting it into a lazy chunk.

**Recommended fix (non-trivial):**
1. Make `CytoscapeGraph.jsx`'s import of `cyAdapter.js` fully dynamic: `const { syncElements, mountCy, ... } = await import('../graph/cyAdapter.js')`
2. Remove the dynamic import in `App.jsx` (it's already static via `CytoscapeGraph`)
3. Wrap `<CytoscapeGraph>` in `React.lazy()` + `<Suspense>` — Cytoscape would load after first render

**Impact:** ~248 KB gzip deferred from initial parse → measurable TTI improvement on mobile/slow connections.

---

## Metrics Summary

| Metric | Session 2 baseline | Session 3 (post-opt) |
|---|---|---|
| Unit tests | 81/81 | 82/82 |
| Heap growth (3 GYG reloads) | 4.66 MB | **3.10 MB** (-34%) |
| localStorage writes per keystroke | 1 (synchronous) | **debounced (1 per 500ms)** |
| Index rebuilds on drag | 1 per frame | **0** (fingerprint) |
| Note edit → Cytoscape sync | full graph sync | **no sync** (notes dep removed) |
| Selection sync complexity | O(n²) | **O(1)** |
