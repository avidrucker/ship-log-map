// src/bg/math.js

/**
 * Background Image Math Utilities
 *
 * Responsibilities
 * - Pure transform helpers for background image manipulations (clamping,
 *   snapping, scaling, translating).
 *
 * Guarantees
 * - No DOM access or side effects; safe for unit tests.
 */

// screen = pan + zoom * ( [tx,ty] + s * [u,v] )
// => CSS: translate( pan + zoom*[tx,ty] ) scale( zoom * s )
export function bgCssTransform({ panX, panY, zoom, tx, ty, s }) {
  const translateX = panX + zoom * tx;
  const translateY = panY + zoom * ty;
  const scale = zoom * s;
  return `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}
