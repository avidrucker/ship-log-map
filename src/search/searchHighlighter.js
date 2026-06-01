// Utilities to clear/select + pulse glow on matches inside Cytoscape
import { printDebug } from '../utils/debug';

export function clearSearchHighlight(cy) {
  printDebug("clearing search highlights...")
  if (!cy) return;
  cy.batch(() => {
    cy.elements('.search-glow').removeClass('search-glow');
    // do not globally unselect; caller controls behavior
  });
}

let searchInProgress = false;
let currentSearchIds = new Set();

export function applySearchSelection({ cy, nodeIds = [], edgeIds = [], alsoSelect = true }) {
  if (!cy) return;

  // Track the current search selection
  currentSearchIds = new Set([...nodeIds, ...edgeIds]);
  searchInProgress = true;

  printDebug("clearing previous search selection...");

  // Step 1: Clear everything (before the debounce delay, so it looks responsive)
  if (alsoSelect) cy.elements().unselect();
  cy.elements('.search-glow').removeClass('search-glow');

  // Step 2: Apply new selection after a brief delay so any pending event handlers
  // (from the unselect above) settle before we write the new state.
  setTimeout(() => {
    printDebug("✅ Applying new selection after clear...");

    // Build selectors safely
    const nodeSel = nodeIds.map(id => `#${CSS.escape(String(id))}`).join(', ');
    const edgeSel = edgeIds.map(id => `#${CSS.escape(String(id))}`).join(', ');

    // Batch all Cytoscape DOM mutations into a single redraw pass
    cy.batch(() => {
      const nodes = nodeSel ? cy.nodes(nodeSel) : cy.collection();
      const edges = edgeSel ? cy.edges(edgeSel) : cy.collection();
      const elems = nodes.union(edges);

      printDebug(`🎯 Selecting ${elems.length} elements`);
      if (alsoSelect) elems.select();
      elems.addClass('search-glow');
    });

    // Step 3: Clear flag after giving selection events time to propagate
    setTimeout(() => {
      searchInProgress = false;
      printDebug('🔍 Search operation completed');
    }, 200);

  }, 100);
}

// Export function to check if search is in progress
export function isSearchInProgress() {
  return searchInProgress;
}

export function isCurrentSearchSelection(elementId) {
  return currentSearchIds.has(elementId);
}

export function clearCurrentSearch() {
  currentSearchIds.clear();
}

// Export the search IDs for debugging
export function getCurrentSearchIds() {
  return Array.from(currentSearchIds);
}