/**
 * overlayManager.js
 *
 * Single place to create, position, refresh, and remove "overlay" graph elements
 * that visually attach to nodes/edges (e.g., note-count badges, "unseen/visited" badges).
 */

import { printDebug } from "../utils/debug.js";

//// Dependencies (soft): tokens for sizes/offsets //////////////////////////////////

let TOKENS = {
  NODE_SIZES: {
    regular: { width: 120, height: 160 },
    small:   { width: 100, height: 120 },
    large:   { width: 160, height: 200 }
  },
  OVERLAY: {
    cornerOffset: { x: 25, y: 20 },     // nudge from top-right corner
    edgeCornerOffset: { x: 35, y: -10 }, // nudge from edge note-count badge
    edgeOffsetY: -18,                    // vertical nudge from edge midpoint
    badgeSize: { w: 36, h: 36 }
  }
};

// Try to import tokens if available, otherwise use defaults
try {
  const { NODE_SIZES, OVERLAY } = await import('../styles/tokens.js');
  TOKENS = { 
    NODE_SIZES: NODE_SIZES || TOKENS.NODE_SIZES, 
    OVERLAY: OVERLAY || TOKENS.OVERLAY 
  };
} catch (e) {
  // Fall back to local TOKENS
  console.log('📏 [overlayManager] Using default tokens (tokens.js not found)', e);
}

const CLS = {
  NOTE_NODE: 'note-count',
  NOTE_EDGE: 'edge-note-count',
  UNSEEN_NODE: 'unseen',
  UNSEEN_EDGE: 'edge-unseen',
  ENTRY_PARENT: 'entry-parent'
};

const OVERLAY_ADD_SELECTOR = 'node.edge-note-count, node.edge-unseen, node.note-count, node.unseen';

function stopOverlayAnims(cy) {
  if (!cy || cy.destroyed()) return;
  // Clear queued + jump to end for any in-flight anims on overlays
  cy.$(OVERLAY_ADD_SELECTOR).stop(true, true);
}

//// Helpers //////////////////////////////////////////////////////////////////////////

/** Normalize Record|Map -> Map<string, number> */
function toNumMap(maybe) {
  if (!maybe) return new Map();
  if (maybe instanceof Map) return maybe;
  return new Map(Object.entries(maybe));
}

/** Normalize Set|string[] -> Set<string> */
function toSet(maybe) {
  if (!maybe) return new Set();
  if (maybe instanceof Set) return maybe;
  if (Array.isArray(maybe)) return new Set(maybe);
  return new Set();
}

/** Corner (top-right) position for an entry-parent node */
function topRightCornerPos(parentNode) {
  const bb = parentNode.boundingBox({ includeLabels: false, includeOverlays: false });
  return {
    x: bb.x2 + TOKENS.OVERLAY.cornerOffset.x,
    y: bb.y1 + TOKENS.OVERLAY.cornerOffset.y
  };
}

/** Midpoint (plus a slight vertical offset) for an edge */
function edgeMidpointPos(edgeEle) {
  const s = edgeEle.source().position();
  const t = edgeEle.target().position();
  return {
    x: (s.x + t.x) / 2,
    y: (s.y + t.y) / 2 + TOKENS.OVERLAY.edgeOffsetY
  };
}

/** Resilient getter for an element by id (empty -> null) */
function getById(cy, id) {
  if (!id) return null;
  const ele = cy.getElementById(id);
  return (ele && !ele.empty()) ? ele : null;
}

/** ID helpers to avoid collisions across overlay types */
function idNodeNote(hostId)   { return `${hostId}__nodeNoteCount`; }
function idEdgeNote(hostId)   { return `${hostId}__edgeNoteCount`; }
function idNodeUnseen(hostId) { return `${hostId}__nodeUnseen`; }
function idEdgeUnseen(hostId) { return `${hostId}__edgeUnseen`; }

//// Creation / update ////////////////////////////////////////////////////////////////

/** Ensure a node-note-count badge exists & positioned. */
function ensureNodeNoteBadge(cy, parentEntryNode, count) {
  const hostId = parentEntryNode.id();
  const badgeId = idNodeNote(hostId);
  let badge = getById(cy, badgeId);

  if (!count || count <= 0) {
    if (badge) cy.remove(badge);
    return;
  }

  const size = parentEntryNode.data('size') || 'regular';

  if (!badge) {
    badge = cy.add({
      group: 'nodes',
      data: { id: badgeId, parent: hostId, label: String(count), size, __overlay: true, isNewlyCreated: false },
      classes: CLS.NOTE_NODE,
      selectable: false,
      grabbable: false
    });
    // badge.lock();       // double-lock defensively
    badge.ungrabify();  // just in case
    badge.stop(true, true);
  } else {
    badge.data('label', String(count));
    badge.data('size', size);
  }

  badge.position(parentEntryNode.position());
  if (cy.scratch('_noteCountsHidden')) {
    badge.addClass('hidden');
  } else { 
    badge.removeClass('hidden');
  }
}

/** Ensure an edge-note-count badge exists & positioned. */
function ensureEdgeNoteBadge(cy, edgeEle, count) {
  const hostId = edgeEle.id();
  const badgeId = idEdgeNote(hostId);
  let badge = getById(cy, badgeId);

  if (!count || count <= 0) {
    if (badge) cy.remove(badge);
    return;
  }

  if (!badge) {
    badge = cy.add({
      group: 'nodes',
      data: { id: badgeId, edgeId: hostId, label: String(count), __overlay: true, isNewlyCreated: false },
      classes: CLS.NOTE_EDGE,
      selectable: false,
      grabbable: false
    });
    // badge.lock();
    badge.ungrabify();
    badge.stop(true, true);
  } else {
    badge.data('label', String(count));
  }

  const pos = edgeMidpointPos(edgeEle);
  badge.position({ x: pos.x + TOKENS.OVERLAY.edgeCornerOffset.x, y: pos.y + TOKENS.OVERLAY.edgeCornerOffset.y });
  if (cy.scratch('_noteCountsHidden')) badge.addClass('hidden'); else badge.removeClass('hidden');
}

/** Ensure an "unseen" badge for an entry node exists (only if not visited). */
function ensureNodeUnseenBadge(cy, parentEntryNode, isVisited) {
  const hostId = parentEntryNode.id();
  const badgeId = idNodeUnseen(hostId);
  const existing = getById(cy, badgeId);

  if (isVisited) {
    if (existing) cy.remove(existing);
    return;
  }

  const badge = existing || cy.add({
    group: 'nodes',
    data: { id: badgeId, hostId, label: '!', __overlay: true, isNewlyCreated: false },
    classes: CLS.UNSEEN_NODE,
  selectable: false,
  grabbable: false
  });
  // badge.lock();
  badge.ungrabify();
  badge.stop(true, true);

  badge.position(topRightCornerPos(parentEntryNode));
}

/** Ensure an "unseen" badge for an edge exists (only if not visited). */
function ensureEdgeUnseenBadge(cy, edgeEle, isVisited) {
  const hostId = edgeEle.id();
  const badgeId = idEdgeUnseen(hostId);
  const existing = getById(cy, badgeId);

  if (isVisited) {
    if (existing) cy.remove(existing);
    return;
  }

  const badge = existing || cy.add({
    group: 'nodes',
    data: { id: badgeId, edgeId: hostId, label: '!', __overlay: true, isNewlyCreated: false },
    classes: CLS.UNSEEN_EDGE,
  selectable: false,
  grabbable: false
  });

  // badge.lock();
  badge.ungrabify();
  badge.stop(true, true);

  const noteBadge = getById(cy, idEdgeNote(hostId));
  if (noteBadge) {
    const p = noteBadge.position();
    badge.position({ x: p.x + TOKENS.OVERLAY.edgeCornerOffset.x, y: p.y + TOKENS.OVERLAY.edgeCornerOffset.y });
  } else {
    const mid = edgeMidpointPos(edgeEle);
    badge.position({ x: mid.x + TOKENS.OVERLAY.edgeCornerOffset.x, y: mid.y + TOKENS.OVERLAY.edgeCornerOffset.y });
  }
}

//// Public: ensure all overlays //////////////////////////////////////////////////////

export function ensure(cy, model) {
  if (!cy || cy.destroyed()) return;

  const nodeCounts = toNumMap(model?.nodeNoteCounts);
  const edgeCounts = toNumMap(model?.edgeNoteCounts);
  const visited = {
    nodes: toSet(model?.visited?.nodes),
    edges: toSet(model?.visited?.edges)
  };

  cy.startBatch();

  // NODE overlays
  cy.nodes(`.${CLS.ENTRY_PARENT}`).forEach((parent) => {
    const id = parent.id();
    const count = nodeCounts.get(id) ?? 0;

    ensureNodeNoteBadge(cy, parent, count);

    if (count > 0) {
      ensureNodeUnseenBadge(cy, parent, visited.nodes.has(id));
    } else {
      const unseenId = idNodeUnseen(id);
      const existingUnseen = getById(cy, unseenId);
      if (existingUnseen) cy.remove(existingUnseen);
    }
  });

  // EDGE overlays
  cy.edges().forEach((edgeEle) => {
    const id = edgeEle.id();
    const count = edgeCounts.get(id) ?? 0;

    ensureEdgeNoteBadge(cy, edgeEle, count);
 
    if (count > 0) {
      ensureEdgeUnseenBadge(cy, edgeEle, visited.edges.has(id));
    } else {
      const unseenId = idEdgeUnseen(id);
      const existingUnseen = getById(cy, unseenId);
      if (existingUnseen) cy.remove(existingUnseen);
    }
  });

  cy.endBatch();
  stopOverlayAnims(cy);
}

let isRefreshing = false; // Recursion guard

//// Public: refresh positions only ///////////////////////////////////////////////////

export function refreshPositions(cy) {
  if (!cy || cy.destroyed() || isRefreshing) return;

  isRefreshing = true;

  try {
    cy.startBatch();

    // Node NOTE-COUNT badges: center on parent
    cy.nodes(`.${CLS.NOTE_NODE}`).forEach((badge) => {
      const parent = badge.parent();
      if (!parent || parent.empty()) return;
      badge.position(parent.position());
    });

    // Node UNSEEN (!) badges: stay at top-right corner
    cy.nodes(`.${CLS.UNSEEN_NODE}`).forEach((badge) => {
      const hostId = badge.data('hostId');
      const parent = getById(cy, hostId);
      if (!parent) return;
      badge.position(topRightCornerPos(parent));
    });

    // Edge badges
    // Edge NOTE-COUNT badges: always from the edge midpoint (no self-anchoring)
    cy.nodes(`.${CLS.NOTE_EDGE}`).forEach((badge) => {
      const edgeId =
        badge.data('edgeId') ||
        (badge.id() || '')
          .replace(/__edgeNoteCount$/,'')    // our id
          .replace(/__noteCount$/,'');       // legacy
      const edgeEle = getById(cy, edgeId);
      if (!edgeEle) return;
      const mid = edgeMidpointPos(edgeEle);
      badge.position({
        x: mid.x + TOKENS.OVERLAY.edgeCornerOffset.x,
        y: mid.y + TOKENS.OVERLAY.edgeCornerOffset.y
      });
    });
 
    // Edge UNSEEN badges: near the note-count badge if present; else from midpoint
    cy.nodes(`.${CLS.UNSEEN_EDGE}`).forEach((badge) => {
      const edgeId =
        badge.data('edgeId') ||
        (badge.id() || '')
          .replace(/__edgeUnseen$/,'')       // our id
          .replace(/__unseen$/,'');          // legacy
      const edgeEle = getById(cy, edgeId);
      if (!edgeEle) return;
      const noteBadge = getById(cy, idEdgeNote(edgeId));
      if (noteBadge) {
        const p = noteBadge.position();
        badge.position({
          x: p.x + TOKENS.OVERLAY.edgeCornerOffset.x,
          y: p.y + TOKENS.OVERLAY.edgeCornerOffset.y
        });
      } else {
        const mid = edgeMidpointPos(edgeEle);
        badge.position({
          x: mid.x + TOKENS.OVERLAY.edgeCornerOffset.x,
          y: mid.y + TOKENS.OVERLAY.edgeCornerOffset.y
        });
      }
    });

    cy.endBatch();
  } finally {
    isRefreshing = false;
    stopOverlayAnims(cy);
  }
}

//// Public: attach/detach geometry listeners /////////////////////////////////////////

/**
 * Minimal event hooks: when hosts finish moves or are repositioned, refresh overlays.
 * Pan/zoom are handled by the camera; no listeners here.
 */
export function attach(cy) {
  if (!cy || cy.destroyed()) return;
  if (cy.scratch('_overlayManager_attached')) return;

  const onMoveFree = () => refreshPositions(cy);
  const onPosition = () => refreshPositions(cy);
  const onAddOverlay = (evt) => {
    const n = evt.target;
    if (!n || !n.isNode()) return;
    // Kill any queued animations and keep it inert, but do not lock:
    try { n.stop(true, true); n.ungrabify(); n.selectify(false); } catch {}
  };

  cy.scratch('_overlayManager_attached', true);
  cy.scratch('_overlayManager_handlers', { onMoveFree, onPosition, onAddOverlay });

  cy.on('free', 'node', onMoveFree);
  cy.on('position', 'node', onPosition);
  cy.on('add', OVERLAY_ADD_SELECTOR, onAddOverlay);
}


export function detach(cy) {
  if (!cy || cy.destroyed()) return;
  if (!cy.scratch('_overlayManager_attached')) return;

  const { onMoveFree, onPosition, onAddOverlay } = cy.scratch('_overlayManager_handlers') || {};
  if (onMoveFree)  cy.off('free', 'node', onMoveFree);
  if (onPosition)  cy.off('position', 'node', onPosition);
  if (onAddOverlay) cy.off('add', OVERLAY_ADD_SELECTOR, onAddOverlay);

  cy.removeScratch('_overlayManager_handlers');
  cy.removeScratch('_overlayManager_attached');
}


//// Public: removal //////////////////////////////////////////////////////////////////

export function removeAll(cy) {
  if (!cy || cy.destroyed()) return;
  cy.nodes(`.${CLS.NOTE_NODE}, .${CLS.UNSEEN_NODE}, .${CLS.NOTE_EDGE}, .${CLS.UNSEEN_EDGE}`).remove();
}

export function setNoteCountsVisible(cy, visible) {
  if (!cy || cy.destroyed()) return;
  cy.scratch('_noteCountsHidden', !visible);
  const sel = `.note-count, .${CLS.NOTE_EDGE}`;
  if (visible) cy.nodes(sel).removeClass('hidden');
  else         cy.nodes(sel).addClass('hidden');
}

// convenience
export function hideNoteCounts(cy){ setNoteCountsVisible(cy, false); }
export function showNoteCounts(cy){ setNoteCountsVisible(cy, true); }

//// Private exports for testing (optional) //////////////////////////////////////////

export const _priv = {
  toNumMap, 
  toSet,
  topRightCornerPos, 
  edgeMidpointPos,
  ensureNodeNoteBadge, 
  ensureEdgeNoteBadge,
  ensureNodeUnseenBadge, 
  ensureEdgeUnseenBadge,
  idNodeNote, 
  idEdgeNote,
  idNodeUnseen,
  idEdgeUnseen,
  CLS, 
  TOKENS
};
