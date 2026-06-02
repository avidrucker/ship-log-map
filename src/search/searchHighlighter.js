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

  currentSearchIds = new Set([...nodeIds, ...edgeIds]);
  searchInProgress = true;

  const nodeSel = nodeIds.map(id => `#${CSS.escape(String(id))}`).join(', ');
  const edgeSel = edgeIds.map(id => `#${CSS.escape(String(id))}`).join(', ');

  // Single batch: all Cytoscape events fire synchronously while searchInProgress=true,
  // so the cyAdapter select handler correctly skips React state updates. React 18
  // automatically batches any resulting dispatches into one render. No timeout needed.
  cy.batch(() => {
    if (alsoSelect) cy.elements().unselect();
    cy.elements('.search-glow').removeClass('search-glow');

    const nodes = nodeSel ? cy.nodes(nodeSel) : cy.collection();
    const edges = edgeSel ? cy.edges(edgeSel) : cy.collection();
    const elems = nodes.union(edges);

    if (alsoSelect) elems.select();
    elems.addClass('search-glow');
  });

  searchInProgress = false;
  printDebug('🔍 Search selection applied');
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