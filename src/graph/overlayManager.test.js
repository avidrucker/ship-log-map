// src/graph/overlayManager.test.js
//
// Locks in the overlay event-listener and badge-structure contracts:
//
//  Event listener contract (BUG-1 fix):
//   - attach() must register 'data' on 'node.entry-parent' so that node
//     resize (updateNodeInPlace sets data.size) immediately repositions badges.
//   - Listeners scoped to 'node.entry-parent' only — bare 'node' fires on every
//     badge reposition and causes compound-layout event cascades.
//   - detach() must remove exactly those listeners without leaking.
//
//  Standalone-badge contract (perf fix):
//   - Node note-count badges must NOT be created with a compound parent.
//   - Reason: being a compound child means font-size/text-margin-y CSS transitions
//     dirty the parent's compound-bounds cache each frame, triggering an extra
//     renderer repaint every frame during the 300ms resize animation → 2fps.
//   - As standalone nodes they are manually positioned by refreshPositions()
//     with RAF-throttled drag tracking, at no extra compound-layout cost.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { attach, detach, ensure, startNodeResizeAnimation, endNodeResizeAnimation } from './overlayManager.js';

function makeMockCy() {
  const scratch = {};
  const handlers = []; // { event, selector, fn }

  return {
    destroyed: () => false,
    scratch(key, val) {
      if (val === undefined) return scratch[key];
      scratch[key] = val;
    },
    removeScratch(key) { delete scratch[key]; },
    on: jest.fn((event, selector, fn) => { handlers.push({ event, selector, fn }); }),
    off: jest.fn(),
    // expose for assertions
    _scratch: scratch,
    _handlers: handlers,
  };
}

describe('overlayManager.attach / detach event listener contract', () => {
  let cy;

  beforeEach(() => {
    cy = makeMockCy();
  });

  test('attach registers a data listener on node.entry-parent', () => {
    attach(cy);
    const registered = cy.on.mock.calls.map(([event, selector]) => ({ event, selector }));
    expect(registered).toContainEqual({ event: 'data', selector: 'node.entry-parent' });
  });

  test('attach registers free/position listeners scoped to node.entry-parent only', () => {
    attach(cy);
    const registered = cy.on.mock.calls.map(([event, selector]) => ({ event, selector }));

    expect(registered).toContainEqual({ event: 'free',     selector: 'node.entry-parent' });
    expect(registered).toContainEqual({ event: 'position', selector: 'node.entry-parent' });

    // Must NOT use bare 'node' — that fires on every badge reposition, causing
    // compound-layout event cascades during CSS transitions.
    const broadNode = registered.filter(r =>
      (r.event === 'free' || r.event === 'position') && r.selector === 'node'
    );
    expect(broadNode).toHaveLength(0);
  });

  test('attach is idempotent — calling it twice does not double-register listeners', () => {
    attach(cy);
    const countAfterFirst = cy.on.mock.calls.length;
    attach(cy);
    expect(cy.on.mock.calls.length).toBe(countAfterFirst);
  });

  test('detach removes every listener that attach registered', () => {
    attach(cy);
    detach(cy);

    // Each attach-registered event+selector pair must appear in an off() call
    const registered = cy.on.mock.calls.map(([event, selector]) => ({ event, selector }));
    const removed    = cy.off.mock.calls.map(([event, selector]) => ({ event, selector }));

    for (const reg of registered) {
      expect(removed).toContainEqual(reg);
    }
  });

  test('detach with the exact same handler functions that attach passed', () => {
    attach(cy);

    // Capture the handler functions passed to on()
    const onCalls  = cy.on.mock.calls;
    const offCalls = [];
    cy.off.mockImplementation((event, selector, fn) => offCalls.push({ event, selector, fn }));

    detach(cy);

    for (const [event, selector, fn] of onCalls) {
      expect(offCalls).toContainEqual({ event, selector, fn });
    }
  });
});

// ---------------------------------------------------------------------------
// Compound-child badge contract
// ---------------------------------------------------------------------------
// Node note-count badges MUST be compound children of their entry-parent node.
// Reason: Cytoscape renders grabbed (dragged) nodes on a separate "drag" canvas
// layer that sits above the main canvas.  Only compound children travel to that
// layer automatically; standalone nodes stay on the main canvas and disappear
// beneath the dragged compound during drag.
//
// Performance invariant: the badge must have NO CSS transition on any property
// that has triggersBounds: diff.any (font-size, text-margin-y, width, height).
// Such transitions fire dirtyCompoundBoundsCache() + renderer.notify('bounds')
// every animation frame — an extra repaint each frame — dropping 60fps to ~2fps.
// The badge therefore snaps to its new size on resize (no animation needed since
// the transparent badge is barely visible during the 300ms node resize).
//
// The badge also stores hostId explicitly so refreshPositions() can look up the
// entry-parent without relying on badge.parent() (more resilient).
// ---------------------------------------------------------------------------

function makeEnsureCy() {
  const addedNodes = [];
  const nodesMap = new Map();   // id → node-like object
  const edgesList = [];

  const makeNode = (id, classes = '', data = {}) => ({
    id: () => id,
    data: (k, v) => v !== undefined ? (data[k] = v) : (k ? data[k] : data),
    addClass: () => {},
    removeClass: () => {},
    position: () => ({ x: 0, y: 0 }),
    length: 1,
    isNode: () => true,
    parent: () => ({ empty: () => true }),
    stop: () => {},
    ungrabify: () => {},
    selectify: () => {},
    hasClass: (cls) => classes.includes(cls),
    _addedData: data,
  });

  const entryParent = makeNode('node1', 'entry-parent', { size: 'regular' });
  nodesMap.set('node1', entryParent);

  return {
    destroyed: () => false,
    startBatch: () => {},
    endBatch: () => {},
    scratch: () => undefined,
    nodes: (selector) => {
      if (selector && selector.includes('entry-parent')) {
        return { forEach: (fn) => fn(entryParent) };
      }
      if (selector && selector.includes('note-count')) {
        return { forEach: () => {}, stop: () => {} };
      }
      return { forEach: () => {}, stop: () => {} };
    },
    edges: () => ({ forEach: () => {} }),
    getElementById: (id) => nodesMap.get(id) || { length: 0, empty: () => true },
    $: () => { const col = { stop: () => {}, forEach: () => {}, not: () => col }; return col; },
    add: jest.fn((spec) => {
      addedNodes.push(spec);
      const node = makeNode(spec.data.id, spec.classes || '', { ...spec.data });
      nodesMap.set(spec.data.id, node);
      return node;
    }),
    remove: () => {},
    _addedNodes: addedNodes,
  };
}

describe('overlayManager.ensure — compound-child badge contract', () => {
  test('node note-count badge is a compound child of its entry-parent', () => {
    const cy = makeEnsureCy();
    ensure(cy, { nodeNoteCounts: { node1: 2 } });

    expect(cy.add).toHaveBeenCalled();
    const badgeSpec = cy.add.mock.calls.find(([s]) => s.classes === 'note-count');
    expect(badgeSpec).toBeDefined();

    // Must be a compound child so Cytoscape includes it in the drag canvas layer.
    // Standalone nodes render on the main canvas and disappear beneath the
    // dragged compound during drag.
    expect(badgeSpec[0].data.parent).toBe('node1');
  });

  test('badge also stores hostId for resilient refreshPositions() lookup', () => {
    const cy = makeEnsureCy();
    ensure(cy, { nodeNoteCounts: { node1: 2 } });

    const badgeSpec = cy.add.mock.calls.find(([s]) => s.classes === 'note-count');
    // hostId lets refreshPositions() find the entry-parent via getById() without
    // relying on badge.parent(), which is more resilient to future structural changes.
    expect(badgeSpec[0].data.hostId).toBe('node1');
  });

  test('badge data includes size and label for all node sizes', () => {
    for (const size of ['regular', 'double', 'half']) {
      const cy = makeEnsureCy();
      cy.nodes('.entry-parent').forEach(n => n.data('size', size));
      ensure(cy, { nodeNoteCounts: { node1: 3 } });

      const badgeSpec = cy.add.mock.calls.find(([s]) => s.classes === 'note-count');
      expect(badgeSpec?.[0].data.parent).toBe('node1');
      expect(badgeSpec?.[0].data.hostId).toBe('node1');
      expect(badgeSpec?.[0].data.label).toBeDefined();
      expect(badgeSpec?.[0].data.size).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Resize-animation borrow/return contract
// ---------------------------------------------------------------------------

function makeAnimCy(hasBadge = true, { dragging = false } = {}) {
  const moves = [];
  const badgeData = {};
  const badgeClasses = new Set();
  const badge = hasBadge ? {
    length: 1,
    empty: () => false,
    move: jest.fn((spec) => { moves.push(spec); }),
    data: jest.fn((k, v) => { if (v !== undefined) badgeData[k] = v; return badgeData[k]; }),
    addClass: jest.fn((cls) => { badgeClasses.add(cls); }),
    removeClass: jest.fn((cls) => { badgeClasses.delete(cls); }),
    hasClass: (cls) => badgeClasses.has(cls),
    _data: badgeData,
    _classes: badgeClasses,
  } : null;

  // Entry node mock
  const entryMoves = [];
  const entryData = {};
  const entryClasses = new Set();
  const entryPos = { x: 0, y: 0 };
  const entry = {
    length: 1,
    empty: () => false,
    move:        jest.fn((spec) => { entryMoves.push(spec); }),
    position:    jest.fn((pos)  => { if (pos) Object.assign(entryPos, pos); return entryPos; }),
    data:        jest.fn((k, v) => { if (v !== undefined) entryData[k] = v; return entryData[k]; }),
    addClass:    jest.fn((cls)  => { entryClasses.add(cls); }),
    removeClass: jest.fn((cls)  => { entryClasses.delete(cls); }),
    _data: entryData, _classes: entryClasses, _moves: entryMoves,
  };

  // minimal cy for start/endNodeResizeAnimation + refreshPositions
  const scratchStore = { _overlay_dragging: dragging };
  const cy = {
    destroyed: () => false,
    scratch: (key, val) => {
      if (val !== undefined) { scratchStore[key] = val; return; }
      return scratchStore[key];
    },
    getElementById: (id) => {
      if (id && id.endsWith('__entry'))         return entry;
      if (id && id.endsWith('__nodeNoteCount')) return hasBadge ? badge : { length: 0, empty: () => true };
      // host node stub — only needs position() for the defensive sync call
      return { length: 1, position: jest.fn(() => ({ x: 100, y: 200 })) };
    },
    // refreshPositions / stopOverlayAnims needs these
    startBatch: () => {},
    endBatch: () => {},
    $: () => { const col = { stop: () => {}, forEach: () => {}, not: () => col }; return col; },
    nodes: () => ({ forEach: () => {} }),
    _moves: moves,
    _badge: badge,
    _entry: entry,
  };

  return cy;
}

describe('overlayManager resize-animation borrow/return', () => {
  test('startNodeResizeAnimation detaches badge from compound via move({ parent: null })', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1');
    expect(cy._badge.move).toHaveBeenCalledWith({ parent: null });
  });

  test('startNodeResizeAnimation adds resize-animating class to protect transition from stopOverlayAnims', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1');
    expect(cy._badge.addClass).toHaveBeenCalledWith('resize-animating');
  });

  test('startNodeResizeAnimation immediately sets nextSize on badge to start transition synchronously', () => {
    // Starts the CSS transition before any React render can call ensure()+stopOverlayAnims,
    // so the transition is deterministic and not dependent on React render timing.
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1', 'double');
    expect(cy._badge.data).toHaveBeenCalledWith('size', 'double');
  });

  test('startNodeResizeAnimation without nextSize skips the data call', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1');
    expect(cy._badge.data).not.toHaveBeenCalled();
  });

  test('endNodeResizeAnimation removes resize-animating class before re-attach', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1', 'double');
    endNodeResizeAnimation(cy, 'node1');
    expect(cy._badge.removeClass).toHaveBeenCalledWith('resize-animating');
    expect(cy._badge.move).toHaveBeenCalledWith({ parent: 'node1' });
  });

  test('endNodeResizeAnimation re-attaches badge to host via move({ parent: hostId })', () => {
    const cy = makeAnimCy();
    endNodeResizeAnimation(cy, 'node1');
    expect(cy._badge.move).toHaveBeenCalledWith({ parent: 'node1' });
  });

  test('startNodeResizeAnimation does not throw when no badge exists', () => {
    expect(() => startNodeResizeAnimation(makeAnimCy(false), 'node1', 'double')).not.toThrow();
  });

  test('endNodeResizeAnimation is a no-op when no badge exists', () => {
    expect(() => endNodeResizeAnimation(makeAnimCy(false), 'node1')).not.toThrow();
  });

  test('start then end moves badge out then back in', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1', 'double');
    endNodeResizeAnimation(cy, 'node1');
    const calls = cy._badge.move.mock.calls;
    expect(calls[0]).toEqual([{ parent: null }]);
    expect(calls[1]).toEqual([{ parent: 'node1' }]);
  });

  test('startNodeResizeAnimation skips detach while _overlay_dragging is set', () => {
    const cy = makeAnimCy(true, { dragging: true });
    startNodeResizeAnimation(cy, 'node1', 'double');
    expect(cy._badge.move).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Entry node borrow/return contract
  // ---------------------------------------------------------------------------
  // The entry node (${hostId}__entry, class node.entry) has 7 bounds-triggering CSS
  // transition properties. While it is a compound child of entry-parent, each animation
  // frame calls dirtyCompoundBoundsCache() → renderer.notify('bounds') → ~2fps stutter.
  // Borrowing it out (move({ parent: null })) makes it standalone for the 300ms window,
  // eliminating the per-frame compound-bounds dirty entirely.

  test('startNodeResizeAnimation detaches entry from compound via move({ parent: null })', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1', 'double');
    expect(cy._entry.move).toHaveBeenCalledWith({ parent: null });
  });

  test('startNodeResizeAnimation syncs entry absolute position to host after detach', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1', 'double');
    expect(cy._entry.position).toHaveBeenCalled();
  });

  test('startNodeResizeAnimation adds resize-animating class to entry', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1', 'double');
    expect(cy._entry.addClass).toHaveBeenCalledWith('resize-animating');
  });

  test('startNodeResizeAnimation immediately sets nextSize on entry to start CSS transition', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1', 'double');
    expect(cy._entry.data).toHaveBeenCalledWith('size', 'double');
  });

  test('endNodeResizeAnimation removes resize-animating from entry then re-attaches', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1', 'double');
    endNodeResizeAnimation(cy, 'node1');
    const removeCalls = cy._entry.removeClass.mock.calls;
    const moveCalls   = cy._entry.move.mock.calls;
    expect(removeCalls[0]).toEqual(['resize-animating']);
    expect(moveCalls[moveCalls.length - 1]).toEqual([{ parent: 'node1' }]);
  });

  test('endNodeResizeAnimation re-attaches entry to host', () => {
    const cy = makeAnimCy();
    endNodeResizeAnimation(cy, 'node1');
    expect(cy._entry.move).toHaveBeenCalledWith({ parent: 'node1' });
  });

  test('start then end: entry moves out then back in order', () => {
    const cy = makeAnimCy();
    startNodeResizeAnimation(cy, 'node1', 'double');
    endNodeResizeAnimation(cy, 'node1');
    expect(cy._entry._moves[0]).toEqual({ parent: null });
    expect(cy._entry._moves[1]).toEqual({ parent: 'node1' });
  });

  test('startNodeResizeAnimation borrows entry even when no badge exists', () => {
    // Regression guard: old code had `if (!badge) return` before entry borrow,
    // silently skipping the fix for nodes with no note-count badge.
    const cy = makeAnimCy(false);
    startNodeResizeAnimation(cy, 'node1', 'double');
    expect(cy._entry.move).toHaveBeenCalledWith({ parent: null });
  });
});
