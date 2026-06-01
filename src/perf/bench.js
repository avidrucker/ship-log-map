// src/perf/bench.js
// Lightweight benchmark helper — no external dependencies.
// Uses performance.now() (available in both jsdom and Node).

export function bench(label, fn, opts = {}) {
  const { iterations = 200, warmup = 20 } = opts;
  for (let i = 0; i < warmup; i++) fn();
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return _stats(label, times);
}

export async function benchAsync(label, fn, opts = {}) {
  const { iterations = 50, warmup = 5 } = opts;
  for (let i = 0; i < warmup; i++) await fn();
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  return _stats(label, times);
}

function _stats(label, times) {
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  const p50  = times[Math.floor(times.length * 0.50)];
  const p95  = times[Math.floor(times.length * 0.95)];
  const min  = times[0];
  const max  = times[times.length - 1];
  const opsPerSec = mean > 0 ? Math.round(1000 / mean) : Infinity;
  return { label, mean, p50, p95, min, max, opsPerSec, iterations: times.length };
}

const COL = 52;
export function printBenchResult(r) {
  console.log(
    `[bench] ${r.label.padEnd(COL)}` +
    `  p50=${r.p50.toFixed(3).padStart(8)}ms` +
    `  p95=${r.p95.toFixed(3).padStart(8)}ms` +
    `  mean=${r.mean.toFixed(3).padStart(8)}ms` +
    `  ops/s=${String(r.opsPerSec).padStart(9)}`
  );
}

export function printBenchHeader() {
  const LINE = '='.repeat(106);
  console.log('\n' + LINE);
  console.log('BENCHMARK RESULTS');
  console.log(LINE);
}

export function printBenchFooter() {
  console.log('='.repeat(106) + '\n');
}
