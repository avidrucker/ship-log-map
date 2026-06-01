# Profiling & Refactor Findings

Captured during the performance profiling sessions (2026-06-01). Covers confirmed hotspots, applied fixes, deferred findings, and bundle observations.

---

## Applied Fixes

### Opt-A — `useHashtagIndex`: 6 useState → 1 setIndexState
**File:** `src/search/useHashtagIndex.js`

The hook had 6 separate `useState` variables (hashtagIndex, labelIndex, allTagsSorted, allLabelsSorted, wordToFullNamesMap, fullNamesMap). Each was set independently at the end of the `useEffect`, which could trigger up to 6 re-renders per index rebuild in older React or under certain batching conditions.

**Fix:** Consolidated into a single `useState` object dispatched in one call.

**Impact:** 6 potential re-renders per rebuild → 1 guaranteed, across all React versions.

---

### Opt-B — `useHashtagIndex`: unstable function references
**File:** `src/search/useHashtagIndex.js`

`getSuggestions` and `findMatchesFromTokens` were plain closures recreated on every render. Any consumer with these in a `useEffect` or `useMemo` dep array would re-run on every parent render, even when the index hadn't changed.

**Fix:** Both functions wrapped in `useCallback` with their actual index data as deps.

**Impact:** Two render-count regression tests were RED before this fix; both GREEN after. Consumers like `HashtagSearchBar` no longer re-run their effects on unrelated parent renders.

---

### Opt-C — `getNodeNotes` / `getEdgeNotes` stability
**File:** `src/App.jsx` (lines 1320–1321)

Verified that these extractors are already stabilized via `useMemo` — no change needed.

---

## Deferred Findings (not yet fixed)

### Finding 1 — Cytoscape `fit()` inside a state updater
**File:** `src/hooks/useGraphOperations.js:298`

`fit()` (a Cytoscape DOM mutation) is called inside a `setGraphData` updater function. State updaters must be pure — side effects with DOM access here are not safe, especially in React 18+ Strict Mode where updaters may run twice.

**Recommended fix:** Move the `fit()` call into a `useLayoutEffect` that runs after the state update settles.

---

### Finding 2 — `setTimeout` inside a state updater
**File:** `src/App.jsx:1024`

A `setTimeout` is called inside a `setGraphData` updater to schedule a Cytoscape node selection. Same class of issue as Finding 1 — side effects belong outside updater functions.

**Recommended fix:** Replace with a `useEffect` that reads the relevant state and fires the selection after render.

---

### Finding 3 — 6 identity `useMemo` wrappers
**File:** `src/App.jsx:1244`

Six consecutive `useMemo` calls that return their input value unchanged — they compute nothing and exist only as pass-throughs. Each adds a memoization entry and a deps comparison on every render with no benefit.

**Recommended fix:** Remove them; pass the values directly.

---

## Bundle Observations

Captured via `npm run analyze` (rollup-plugin-visualizer):

| Package | Pre-min | Gzip | % of bundle |
|---|---|---|---|
| cytoscape | 1,079 KB | 248 KB | 52% |
| react-dom | 527 KB | 93 KB | 26% |
| app source | 419 KB | 108 KB | 20% |
| react | 20 KB | 6 KB | 1% |

**Shipped bundle:** 818.6 KB min / **254 KB gzip** (JS) + 74 KB min / 14 KB gzip (CSS)

**Tachyons is correctly in the CSS asset** — not bundled into JS.

### Actionable bundle finding

`cyAdapter.js` is both statically imported by `CytoscapeGraph.jsx` and dynamically imported by `App.jsx` and `DebugModal.jsx`. Rollup's static import wins, so the dynamic import never splits — Cytoscape ends up in the main chunk unconditionally.

**Opportunity:** If `CytoscapeGraph.jsx` switched to a dynamic `import()` for `cyAdapter`, the entire ~1 MB Cytoscape chunk could be deferred until after first render, improving TTI on slow connections. This is a meaningful refactor since `CytoscapeGraph` is the core rendering component — worth a dedicated session.

---

## Benchmark Baselines

Captured before optimizations. See `src/perf/baselines.json` for machine-readable values.

| Benchmark | p50 (pre-opt) | p50 (post-opt) |
|---|---|---|
| buildIndex — 10 nodes | 0.153 ms | 0.136 ms |
| buildIndex — 50 nodes | 0.838 ms | 0.538 ms (-36%) |
| buildIndex — 100 nodes | 1.185 ms | 1.105 ms |
| buildIndex — 200 nodes | 2.153 ms | 2.482 ms (noise) |
| getSuggestions (word, 100n) | 0.013 ms | 0.009 ms |
| getSuggestions (hashtag, 100n) | 0.010 ms | 0.013 ms (noise) |

Pure function benchmarks (extractHashtags, normalize, serde, addNode, removeNode) were unchanged by these optimizations and their variance is within normal JIT noise (±30–50% at sub-ms scale).

## E2E Baseline (GYG graph)

Captured via `npm run e2e:perf` (Playwright + Chromium):

| Measurement | Value |
|---|---|
| Initial load (nav → canvas visible) | 377 ms |
| FPS during pan | 52 FPS |
| Search latency (Ctrl+F + keystroke + 300ms settle) | 461 ms |
| Heap growth over 3 reloads | 4.66 MB (threshold < 20 MB ✓) |
