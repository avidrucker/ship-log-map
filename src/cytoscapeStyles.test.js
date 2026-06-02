// src/cytoscapeStyles.test.js
//
// Locks in the note-count badge CSS transition contract:
//
//   TRANSITION ON font-size and text-margin-y ONLY.
//
//   Why these props, not width/height:
//     font-size and text-margin-y have triggersBounds: diff.any in Cytoscape's
//     property table.  When animated on a COMPOUND CHILD, each frame calls
//     dirtyCompoundBoundsCache() → renderer.notify('bounds') → extra repaint.
//     However: during a resize the badge is temporarily detached from the
//     compound (made standalone via ele.move({ parent: null })) in
//     App.handleNodeDoubleClick, so this cascade does not fire.
//
//     width/height are additionally excluded because they change the compound's
//     actual bounding box geometry, which triggers updateCompoundBounds() even
//     for standalone nodes — causing visible layout jumps on re-attach.
//
//   Duration must match the entry-node resize transition so the re-attach
//   setTimeout in App.jsx fires after the animation is complete.

import { describe, test, expect } from '@jest/globals';
import styles from './cytoscapeStyles.js';

function findRule(selectorSubstring) {
  return styles.find(r => r.selector && r.selector.includes(selectorSubstring));
}

describe('note-count badge CSS transition contract', () => {
  test('badge base style has a transition-property defined', () => {
    const rule = findRule('node.note-count');
    expect(rule).toBeDefined();
    expect(rule.style['transition-property']).toBeDefined();
  });

  test('badge transitions font-size and text-margin-y for smooth resize', () => {
    const rule = findRule('node.note-count');
    const props = rule.style['transition-property'];
    expect(props).toContain('font-size');
    expect(props).toContain('text-margin-y');
  });

  test('badge does NOT transition width or height', () => {
    // width/height change the compound bounding box even as a standalone node
    // and cause layout jumps on re-attach after the animation.
    const rule = findRule('node.note-count');
    const propList = rule.style['transition-property'].split(/[\s,]+/);
    expect(propList).not.toContain('width');
    expect(propList).not.toContain('height');
  });

  test('badge transition duration matches entry-node transition duration', () => {
    // The re-attach setTimeout in App.handleNodeDoubleClick uses this duration
    // as its deadline — they must stay in sync.
    const badgeRule = findRule('node.note-count');
    const entryRule = styles.find(r =>
      r.selector === 'node.entry' && r.style['transition-duration']
    );
    expect(entryRule).toBeDefined();
    expect(badgeRule.style['transition-duration']).toBe(entryRule.style['transition-duration']);
  });
});

describe('entry node CSS transition contract', () => {
  // node.entry has 7 bounds-triggering CSS transition properties. Any of these on a
  // compound child fires dirtyCompoundBoundsCache() each frame → renderer.notify('bounds')
  // → ~2fps stutter. overlayManager.startNodeResizeAnimation borrows entry out of its
  // compound BECAUSE of these. If you remove these transitions, remove the entry
  // borrow/return too. If you add new bounds-triggering props, re-verify perf.

  test('node.entry has a transition-property defined', () => {
    const rule = styles.find(r => r.selector === 'node.entry' && r.style['transition-property']);
    expect(rule).toBeDefined();
  });

  test('node.entry transition-property includes all 7 bounds-triggering props', () => {
    const rule = styles.find(r => r.selector === 'node.entry' && r.style['transition-property']);
    const props = rule.style['transition-property'];
    const boundsTriggering = [
      'height', 'width',
      'background-position-y', 'background-width', 'background-height',
      'text-margin-y', 'font-size',
    ];
    for (const p of boundsTriggering) expect(props).toContain(p);
  });

  test('node.entry transition duration matches note-count badge duration', () => {
    // Both nodes are borrowed simultaneously; they must finish at the same time so
    // endNodeResizeAnimation's single setTimeout re-attaches both correctly.
    const entryRule = styles.find(r => r.selector === 'node.entry' && r.style['transition-property']);
    const badgeRule = findRule('node.note-count');
    expect(entryRule.style['transition-duration']).toBe(badgeRule.style['transition-duration']);
  });
});
