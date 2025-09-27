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
  printDebug(`🔍 Current selection mode: ${cy.selectionType()}`); // ← Add this
  printDebug(`🔍 Currently selected before clear: ${cy.$(':selected').map(n => n.id()).join(', ')}`); // ← Add this

  // Step 1: Clear everything
  if (alsoSelect) {
    const currentlySelected = cy.elements(':selected');
    printDebug(`🧹 About to unselect ${currentlySelected.length} elements: ${currentlySelected.map(n => n.id()).join(', ')}`);
    cy.elements().unselect();
  }
  cy.elements('.search-glow').removeClass('search-glow');

  // Step 2: Wait longer, then apply new selection
  setTimeout(() => {
    printDebug("✅ Applying new selection after clear...");
    printDebug(`🔍 Selection mode during apply: ${cy.selectionType()}`); // ← Add this
    
    // Build selectors safely
    const nodeSel = nodeIds.map(id => `#${CSS.escape(String(id))}`).join(', ');
    const edgeSel = edgeIds.map(id => `#${CSS.escape(String(id))}`).join(', ');

    const nodes = nodeSel ? cy.nodes(nodeSel) : cy.collection();
    const edges = edgeSel ? cy.edges(edgeSel) : cy.collection();
    const elems = nodes.union(edges);

    printDebug(`🎯 About to select ${elems.length} elements: ${elems.map(n => n.id()).join(', ')}`);

    // Apply selection and glow class
    if (alsoSelect) {
      elems.select();
      printDebug(`✅ Selection applied. Currently selected: ${cy.$(':selected').map(n => n.id()).join(', ')}`);
    }
    elems.addClass('search-glow');

    printDebug(`🔍 Applied search selection to ${elems.length} elements`);

    // Check selection immediately after
    setTimeout(() => {
      printDebug(`🔍 Selection check after 10ms: ${cy.$(':selected').map(n => n.id()).join(', ')}`);
    }, 10);

    // Step 3: Clear flag after selection is applied
    setTimeout(() => {
      searchInProgress = false;
      printDebug('🔍 Search operation completed, clearing flag');
      printDebug(`🔍 Final selection state: ${cy.$(':selected').map(n => n.id()).join(', ')}`);
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