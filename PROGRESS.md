# ship-log-map — Progress Log

## Session 1: Code Quality Review + TDD Bug Fixes

### Bugs Found & Fixed (4 total)

| # | File | Bug | Fix |
|---|---|---|---|
| 1 | `src/hooks/useVisited.js` | Switching `mapName` wrote stale visited data under the new map's localStorage key | Added `prevMapNameRef` to skip the persist effect during map transitions |
| 2 | `src/search/hashtagUtils.js` | Module-level `/g` regex (`HASHTAG_RE`) — external `lastIndex` mutation could silently drop matches | Moved regex inside `extractHashtagsFromText` so each call gets a fresh `lastIndex = 0` |
| 3 | `src/utils/cdnHelpers.js` | `finally` block set `currentCdnLoadRef.current = false` instead of `null` | Changed to `null` for explicit intent (functionally equivalent but safe against future `=== null` guards) |
| 4 | `src/persistence/index.js` | `loadFromLocal` deserialized graph (sanitizing mode), then immediately overwrote `graph.mode` with raw `parsed.mode`, bypassing sanitization | Added `VALID_MODES` check after `deserializeGraph`; applied same fix to `loadFromFile` |

### TDD Test Files Created

| Test file | Tests | Notes |
|---|---|---|
| `src/hooks/useVisited.test.js` | 6 | 1 RED→GREEN (map-switch stale write), 5 behavioral |
| `src/search/hashtagUtils.test.js` | 13 | All GREEN (behavioral safety net for regex refactor) |
| `src/utils/cdnHelpers.test.js` | 4 | All GREEN (concurrent load guard behaviors) |
| `src/persistence/persistence.test.js` | 6 | 1 RED→GREEN (invalid mode bypass), 5 behavioral |

### Test Count After Session 1: **75 tests, all passing**

---

## Session 2: Performance Profiling Harness + Optimizations

### Harness Files Created

| File | Purpose |
|---|---|
| `src/perf/bench.js` | `bench()` / `benchAsync()` helper — `performance.now()`, no extra deps |
| `src/perf/baselines.json` | Captured p50 baseline numbers before optimizations |
| `src/perf/pure.bench.test.js` | Pure function benchmarks (`extractHashtagsFromText`, `normalizeGraph`, serde, graph ops) |
| `src/perf/index.bench.test.js` | `useHashtagIndex` inner-loop benchmarks at 10/50/100/200 nodes |
| `src/perf/memory.bench.test.js` | Heap growth test via `process.memoryUsage()` (requires `--expose-gc`) |
| `src/perf/renderCounts.test.js` | Deterministic render-count assertions — part of `npm test` |
| `jest.perf.config.json` | Separate Jest config targeting `*.bench.test.js` only |
| `playwright.config.js` | Playwright config pointing at the Vite dev server |
| `e2e/perf.spec.js` | Browser E2E perf measurements against the GYG dataset |

### New npm Scripts

| Script | What it does |
|---|---|
| `npm run perf` | Runs all `*.bench.test.js` files via `jest.perf.config.json` |
| `npm run perf:mem` | Same with `node --expose-gc` for heap growth tests |
| `npm run analyze` | `ANALYZE=1 vite build` — opens rollup-plugin-visualizer bundle report |
| `npm run e2e` | Runs all Playwright E2E tests |
| `npm run e2e:perf` | Runs `e2e/perf.spec.js` with list reporter |

### New devDependencies Added

- `rollup-plugin-visualizer@^5.14.0` — bundle composition analysis
- `@playwright/test@^1.52.0` + Chromium browser — browser E2E testing

### Baseline Numbers (captured before optimizations)

```
buildIndex — 10 nodes      p50 =  0.153 ms
buildIndex — 50 nodes      p50 =  0.838 ms
buildIndex — 100 nodes     p50 =  1.185 ms
buildIndex — 200 nodes     p50 =  2.153 ms

extractHashtagsFromText — 1 tag      p50 =  0.003 ms
extractHashtagsFromText — 50 tags    p50 =  0.051 ms
extractHashtagsFromText — 200 tags   p50 =  0.240 ms

normalizeGraph — 10/100/500 nodes    p50 ~  0.004–0.005 ms (trivially fast)
serialize + deserialize — 100 nodes  p50 =  0.764 ms
addNode — 100-node graph             p50 =  0.014 ms
removeNodeAndEdges — 100-node        p50 =  0.029 ms

getSuggestions (word prefix, 100n)   p50 =  0.013 ms
getSuggestions (hashtag, 100n)       p50 =  0.010 ms
```

### Hotspot Confirmed: `useHashtagIndex.js`

Two issues found in `src/search/useHashtagIndex.js`:

**Issue 1 (Opt-A):** 6 separate `useState` calls, each triggering its own potential re-render per index rebuild.
```js
// Before: 6 setState calls per effect run
setHashtagIndex(tagMap);
setLabelIndex(labelMap);
setAllTagsSorted(sortedTags);
setAllLabelsSorted(sortedLabels);
setWordToFullNamesMap(wordToFullNamesMap);
setFullNamesMap(fullNamesMap);

// After: 1 setIndexState call
setIndexState({ hashtagIndex: tagMap, labelIndex: labelMap, allTagsSorted, allLabelsSorted, wordToFullNamesMap, fullNamesMap });
```

**Issue 2 (Opt-B):** `getSuggestions` and `findMatchesFromTokens` were plain closures — new function objects on every render, causing consumers to re-run effects unnecessarily.
```js
// After: stable references via useCallback
const getSuggestions = useCallback(function getSuggestions(input, limit = 12) { ... },
  [allTagsSorted, fullNamesMap, wordToFullNamesMap]);

const findMatchesFromTokens = useCallback(function findMatchesFromTokens(tokens) { ... },
  [hashtagIndex, labelIndex, fullNamesMap]);
```

**Opt-C** (App.jsx calling convention): `getNodeNotes`/`getEdgeNotes` were already stabilized with `useMemo` in `App.jsx:1320-1321` — no change needed.

### Post-Optimization Benchmark Numbers

Post-opt p50 numbers vs baseline (captured after Opt-A + Opt-B):

| Benchmark | Baseline p50 | Post-opt p50 | Delta |
|---|---|---|---|
| buildIndex — 10n | 0.153 ms | 0.136 ms | -11% |
| buildIndex — 50n | 0.838 ms | 0.538 ms | -36% |
| buildIndex — 100n | 1.185 ms | 1.105 ms | -7% |
| buildIndex — 200n | 2.153 ms | 2.482 ms | +15% (noise) |
| extractHashtags — 1 | 0.003 ms | 0.002 ms | noise |
| extractHashtags — 50 | 0.051 ms | 0.035 ms | noise |
| extractHashtags — 200 | 0.240 ms | 0.152 ms | noise |
| serde — 100n | 0.764 ms | 0.380 ms | noise |
| addNode — 100n | 0.014 ms | 0.008 ms | noise |
| removeNode — 100n | 0.029 ms | 0.017 ms | noise |
| getSuggestions word 50n | 0.013 ms | 0.008 ms | noise |
| getSuggestions hashtag 50n | 0.011 ms | 0.012 ms | noise |
| getSuggestions word 100n | 0.013 ms | 0.009 ms | noise |
| getSuggestions hashtag 100n | 0.010 ms | 0.013 ms | noise |

**Note on variance:** Micro-benchmarks at sub-millisecond scale have high JIT warmup variance (±30–50% is normal). Pure function numbers (extractHashtags, serde, addNode, removeNode) were not touched by Opt-A/B — deltas there are noise, not improvement. The `buildIndex` 50n result (-36%) is plausibly real: Opt-A reduces object allocation in the effect closure. The meaningful improvements are behavioral:

- **Render count**: 6 potential re-renders per rebuild → **1 guaranteed** (React 19 batching was already reducing this, but now it's explicit and safe across all React versions)
- **Reference stability**: `getSuggestions` and `findMatchesFromTokens` are now stable references when the index hasn't changed — `HashtagSearchBar` effects that depend on these functions no longer re-run on every parent render

### Render Count Test Results

| Test | Before Opt | After Opt |
|---|---|---|
| `changing nodes triggers ≤2 consumer renders` | GREEN | GREEN |
| `same nodes reference causes no extra render` | GREEN | GREEN |
| `getSuggestions reference stable when unchanged` | **RED** | GREEN |
| `findMatchesFromTokens reference stable when unchanged` | **RED** | GREEN |
| `10 rapid viewport changes → 0 immediate renders` | GREEN | GREEN |
| `10 rapid viewport changes → 1 render after debounce` | GREEN | GREEN |

### Test Count After Session 2: **81 tests, all passing**

---

## Current State

```
npm test     → 81/81 passing (10 suites)
npm run perf → 18/18 passing (bench numbers in baselines.json)
```

### Files Modified in Both Sessions

```
src/hooks/useVisited.js          — prevMapNameRef guard
src/persistence/index.js         — VALID_MODES validation
src/search/hashtagUtils.js       — local HASHTAG_RE
src/utils/cdnHelpers.js          — null instead of false
src/search/useHashtagIndex.js    — Opt-A (1 setState) + Opt-B (useCallback)
jest.config.json                 — testPathIgnorePatterns for bench + e2e
package.json                     — new scripts + devDeps
vite.config.js                   — rollup-plugin-visualizer (ANALYZE=1)
```

---

## E2E Baseline (GYG graph, Playwright + Chromium, 2026-06-01)

All 5 tests passing (`npm run e2e:perf`).

| Measurement | Value |
|---|---|
| Initial load time (nav → canvas visible) | **377 ms** |
| FPS during pan | **52 FPS** |
| Search latency (Ctrl+F open → keystroke → 300ms settle) | **461 ms** |
| Node click → modal open | skipped (click landed on empty canvas) |
| Heap after warm-up GYG load | 7.5 MB |
| Heap after 3 more reloads | 12.2 MB |
| Heap growth over 3 reloads | **4.66 MB** (< 20 MB threshold ✓) |

**Fixes applied to reach full 5/5:**
- `FpsCounter.jsx` — added `data-testid="fps-counter"`
- `e2e/perf.spec.js` — search test now presses `Ctrl+F` first (panel returns `null` when closed)
- `e2e/perf.spec.js` — heap test uses CDP `Runtime.getHeapUsage` (Playwright has no `page.metrics()`)

---

## Bundle Analysis (`npm run analyze`, 2026-06-01)

Rollup-plugin-visualizer breakdown (pre-minification module sizes):

| Package | Rendered | Gzip | % of bundle |
|---|---|---|---|
| cytoscape | 1,078.7 KB | 247.8 KB | **52%** |
| react-dom | 526.9 KB | 92.7 KB | 26% |
| app source | 419.0 KB | 107.8 KB | 20% |
| react | 19.7 KB | 5.6 KB | 1% |
| scheduler | 11.2 KB | 2.8 KB | 1% |

**Shipped chunk sizes (post-minification, from Vite output):**
- `main.js`: 818.6 kB min / **254.1 kB gzip**
- `main.css`: 74.1 kB min / 14.3 kB gzip
- `tokens.js`: 0.9 kB

**Key findings:**
1. Cytoscape is 52% of the JS bundle — fully bundled, not tree-shaken (expected: Cytoscape doesn't export separate modules)
2. Tachyons CSS is **not** in the JS bundle — correctly in the separate CSS asset ✓
3. No surprise large transitive deps — only react, react-dom, cytoscape, scheduler
4. **Opportunity**: `cyAdapter.js` has a static+dynamic import conflict that prevents Cytoscape from being code-split into a lazy chunk. If `CytoscapeGraph.jsx` switched to a dynamic `import()`, the 1 MB Cytoscape chunk could be deferred until after first render. Not in scope for this session.

---

## Next Steps

### Immediate
- [x] **Run E2E perf suite**: `npm run e2e:perf` — done, numbers above
- [x] **Bundle analysis**: `npm run analyze` — done, findings above
- [ ] **Commit** — two commits: bug fixes (Session 1) + perf harness (Session 2)

### Remaining Code-Review Findings (from Session 1, not yet addressed)
- Finding #3: `src/hooks/useGraphOperations.js:298` — Cytoscape `fit()` call inside a `setGraphData` updater (direct mutation, should be in `useLayoutEffect`)
- Finding #4: `src/App.jsx:1024` — `setTimeout` inside `setGraphData` updater for Cytoscape selection
- Finding #9: `src/App.jsx:1244` — 6 identity `useMemo` wrappers that compute nothing
