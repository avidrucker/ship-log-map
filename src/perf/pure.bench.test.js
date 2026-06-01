// src/perf/pure.bench.test.js
// Pure-function benchmarks — no React, no DOM.
// Excluded from `npm test`; run via `npm run perf`.
// Tests always pass (no timing assertions); output is the report.

import { bench, printBenchResult, printBenchHeader, printBenchFooter } from './bench.js';
import { extractHashtagsFromText } from '../search/hashtagUtils.js';
import {
  normalizeGraph, serializeGraph, deserializeGraph,
  addNode, removeNodeAndEdges,
} from '../graph/ops.js';

function makeNodes(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `node_${i}`,
    title: `Place ${i % 3 === 0 ? 'Multi Word' : 'Simple'} Name ${i}`,
    x: i * 10, y: (i % 10) * 20,
    size: 'regular', color: 'gray',
    note: `About place ${i}. #tag${i % 10} #category${i % 5} extra text.`,
  }));
}

function makeEdges(nodes) {
  return nodes.slice(1).map((n, i) => ({
    id: `${nodes[i].id}__${n.id}`,
    source: nodes[i].id, target: n.id, direction: 'forward',
  }));
}

beforeAll(() => printBenchHeader());
afterAll(() => printBenchFooter());

// ---------------------------------------------------------------------------
describe('extractHashtagsFromText', () => {
  test('1 hashtag', () => {
    const r = bench('extractHashtagsFromText — 1 tag',
      () => extractHashtagsFromText('note with #single tag here'),
      { iterations: 1000 });
    printBenchResult(r);
    expect(r.p50).toBeGreaterThan(0);
  });

  test('50 hashtags', () => {
    const text = Array.from({ length: 50 }, (_, i) => `word #tag${i}`).join(' ');
    const r = bench('extractHashtagsFromText — 50 tags',
      () => extractHashtagsFromText(text),
      { iterations: 500 });
    printBenchResult(r);
    expect(r.p50).toBeGreaterThan(0);
  });

  test('200 hashtags', () => {
    const text = Array.from({ length: 200 }, (_, i) => `word #tag${i}`).join(' ');
    const r = bench('extractHashtagsFromText — 200 tags',
      () => extractHashtagsFromText(text),
      { iterations: 200 });
    printBenchResult(r);
    expect(r.p50).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe('normalizeGraph', () => {
  for (const n of [10, 100, 500]) {
    test(`${n} nodes`, () => {
      const raw = { nodes: makeNodes(n), edges: [] };
      const r = bench(`normalizeGraph — ${n} nodes`,
        () => normalizeGraph(raw),
        { iterations: n >= 500 ? 50 : 200 });
      printBenchResult(r);
      expect(r.p50).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
describe('serializeGraph + deserializeGraph round-trip', () => {
  test('100 nodes', () => {
    const nodes = makeNodes(100);
    const graph = { nodes, edges: makeEdges(nodes), notes: {}, mode: 'editing' };
    const r = bench('serialize + deserialize — 100 nodes', () => {
      deserializeGraph(serializeGraph(graph));
    }, { iterations: 100 });
    printBenchResult(r);
    expect(r.p50).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe('addNode / removeNodeAndEdges', () => {
  test('addNode to 100-node graph', () => {
    const graph = { nodes: makeNodes(100), edges: [], notes: {}, mode: 'editing' };
    let counter = 0;
    const r = bench('addNode — 100-node graph',
      () => addNode(graph, { id: `new_${counter++}`, title: 'New Place', x: 0, y: 0 }),
      { iterations: 200 });
    printBenchResult(r);
    expect(r.p50).toBeGreaterThan(0);
  });

  test('removeNodeAndEdges from 100-node graph', () => {
    const nodes = makeNodes(100);
    const graph = { nodes, edges: makeEdges(nodes), notes: {}, mode: 'editing' };
    const r = bench('removeNodeAndEdges — 100-node graph',
      () => removeNodeAndEdges(graph, 'node_50'),
      { iterations: 200 });
    printBenchResult(r);
    expect(r.p50).toBeGreaterThan(0);
  });
});
