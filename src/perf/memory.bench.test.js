// src/perf/memory.bench.test.js
// Memory-leak detection using node --expose-gc.
// Excluded from `npm test`; run via `npm run perf:mem`.
// Without --expose-gc the test skips gracefully — gc() unavailable in jsdom.

import { extractHashtagsFromText } from '../search/hashtagUtils.js';

const STOP_WORDS = new Set(['a', 'an', 'of', 'in', 'at', 'on', 'to']);

function buildIndex(nodes) {
  const tagMap = new Map();
  const labelMap = new Map();
  const fullNamesMap = new Map();
  const wordToFullNamesMap = new Map();
  for (const n of nodes) {
    for (const t of extractHashtagsFromText(n.note || '')) {
      const e = tagMap.get(t) || { nodes: new Set(), edges: new Set() };
      e.nodes.add(n.id);
      tagMap.set(t, e);
    }
    if (n.title) {
      const full = n.title.trim();
      const low  = full.toLowerCase();
      fullNamesMap.set(n.id, full);
      if (!labelMap.has(low)) labelMap.set(low, new Set());
      labelMap.get(low).add(n.id);
      for (const word of low.split(/\s+/).filter(Boolean)) {
        if (STOP_WORDS.has(word)) continue;
        if (!labelMap.has(word)) labelMap.set(word, new Set());
        labelMap.get(word).add(n.id);
        if (!wordToFullNamesMap.has(word)) wordToFullNamesMap.set(word, new Set());
        wordToFullNamesMap.get(word).add(full);
      }
    }
  }
  return { tagMap, labelMap, fullNamesMap, wordToFullNamesMap };
}

const NODES_100 = Array.from({ length: 100 }, (_, i) => ({
  id: `n${i}`,
  title: `Place Name ${i}`,
  note: `#tag${i % 10} #cat${i % 5}`,
}));

test('repeated index rebuilds do not grow the heap', () => {
  if (typeof global.gc !== 'function') {
    console.warn('[memory] Skipping: run with node --expose-gc  (npm run perf:mem)');
    return;
  }

  global.gc();
  const before = process.memoryUsage().heapUsed;

  // 200 rebuilds — result immediately discarded so GC can reclaim
  for (let i = 0; i < 200; i++) {
    void buildIndex(NODES_100);
  }

  global.gc();
  const after = process.memoryUsage().heapUsed;
  const growthMB = (after - before) / 1024 / 1024;
  console.log(`[memory] Heap growth after 200 rebuilds: ${growthMB.toFixed(2)} MB`);
  expect(growthMB).toBeLessThan(5);
});
