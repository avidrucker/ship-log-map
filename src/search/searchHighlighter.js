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

export function applySearchSelection({ cy, nodeIds = [], edgeIds = [], alsoSelect = true }) {
  if (!cy) return;

  searchInProgress = true;

  cy.batch(() => {
    // Clear prev
    cy.elements('.search-glow').removeClass('search-glow');
    if (alsoSelect) cy.elements().unselect();
    printDebug("clearing previous search selection...");

    // Build selectors safely
    const nodeSel = nodeIds.map(id => `#${CSS.escape(String(id))}`).join(', ');
    const edgeSel = edgeIds.map(id => `#${CSS.escape(String(id))}`).join(', ');

    const nodes = nodeSel ? cy.nodes(nodeSel) : cy.collection();
    const edges = edgeSel ? cy.edges(edgeSel) : cy.collection();

    const elems = nodes.union(edges);

    // select + glow
    if (alsoSelect) elems.select();
    elems.addClass('search-glow');

    printDebug(`🔍 Applied search selection to ${elems.length} elements`);
  });

  // Clear the flag after a short delay to ensure all events have processed
  setTimeout(() => {
    searchInProgress = false;
    printDebug('🔍 Search operation completed, clearing flag');
  }, 500);
}

// Export function to check if search is in progress
export function isSearchInProgress() {
  return searchInProgress;
}