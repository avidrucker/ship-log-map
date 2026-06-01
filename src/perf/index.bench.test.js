// src/perf/index.bench.test.js
// useHashtagIndex indexing-logic benchmarks.
// Uses a local mirror of the hook's inner loop so we measure the algorithm
// without React overhead. Excluded from `npm test`; run via `npm run perf`.

import { bench, printBenchResult, printBenchHeader, printBenchFooter } from './bench.js';
import { extractHashtagsFromText } from '../search/hashtagUtils.js';

const STOP_WORDS = new Set(['a', 'an', 'of', 'in', 'at', 'on', 'to']);

// Mirrors the useEffect body in useHashtagIndex.js
function buildIndex(nodes, edges = []) {
  const tagMap = new Map();
  const labelMap = new Map();
  const fullNamesMap = new Map();
  const wordToFullNamesMap = new Map();

  for (const n of nodes) {
    const note = [n.note, ...(Array.isArray(n.notes) ? n.notes : [])].filter(Boolean).join('\n');
    for (const t of extractHashtagsFromText(note)) {
      const entry = tagMap.get(t) || { nodes: new Set(), edges: new Set() };
      entry.nodes.add(n.id);
      tagMap.set(t, entry);
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

  for (const e of edges) {
    for (const t of extractHashtagsFromText(e.note || '')) {
      const entry = tagMap.get(t) || { nodes: new Set(), edges: new Set() };
      entry.edges.add(e.id);
      tagMap.set(t, entry);
    }
  }

  const allTagsSorted = Array.from(tagMap.keys()).sort();
  return { tagMap, labelMap, fullNamesMap, wordToFullNamesMap, allTagsSorted };
}

// Mirrors getSuggestions from useHashtagIndex.js
function getSuggestions({ allTagsSorted, wordToFullNamesMap, fullNamesMap }, input, limit = 12) {
  const raw = (input || '').trim();
  if (!raw) return [];
  const q = raw.toLowerCase();
  const words = q.split(/\s+/);
  const out = [], seen = new Set();

  if (words[0]?.startsWith('#')) {
    const last = words[words.length - 1].replace(/^#/, '');
    for (const tag of allTagsSorted) {
      if (tag.startsWith(last)) { out.push('#' + tag); seen.add(tag); if (out.length >= limit) break; }
    }
    return out;
  }

  const w = words[0];
  for (const tag of allTagsSorted) {
    if (tag.startsWith(w)) { out.push('#' + tag); seen.add(tag); if (out.length >= limit) break; }
  }
  if (out.length < limit) {
    for (const [word, names] of wordToFullNamesMap) {
      if (word.startsWith(w)) {
        for (const name of names) {
          if (!seen.has(name)) { out.push(name); seen.add(name); if (out.length >= limit) break; }
        }
      }
      if (out.length >= limit) break;
    }
  }
  return out;
}

function makeNodes(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `node_${i}`,
    title: `Place ${i % 2 === 0 ? 'Multi Word' : ''} Name ${i}`.trim(),
    note: `Note for node ${i}. #tag${i % 10} #cat${i % 5} extra text.`,
  }));
}

beforeAll(() => printBenchHeader());
afterAll(() => printBenchFooter());

// ---------------------------------------------------------------------------
describe('buildIndex (useHashtagIndex inner loop)', () => {
  for (const n of [10, 50, 100, 200]) {
    test(`${n} nodes`, () => {
      const nodes = makeNodes(n);
      const r = bench(`buildIndex — ${n} nodes`, () => buildIndex(nodes),
        { iterations: n >= 200 ? 50 : 200 });
      printBenchResult(r);
      expect(r.p50).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
describe('getSuggestions (query performance against built index)', () => {
  for (const n of [50, 100]) {
    test(`word prefix at ${n} nodes`, () => {
      const idx = buildIndex(makeNodes(n));
      const r = bench(`getSuggestions "pl" (word prefix) — ${n} nodes`,
        () => getSuggestions(idx, 'pl'));
      printBenchResult(r);
      expect(r.p50).toBeGreaterThan(0);
    });

    test(`hashtag prefix at ${n} nodes`, () => {
      const idx = buildIndex(makeNodes(n));
      const r = bench(`getSuggestions "#tag" (hashtag prefix) — ${n} nodes`,
        () => getSuggestions(idx, '#tag'));
      printBenchResult(r);
      expect(r.p50).toBeGreaterThan(0);
    });
  }
});
