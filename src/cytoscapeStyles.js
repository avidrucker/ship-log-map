// src/cytoscapeStyles.js

/**
 * Cytoscape Style Sheet
 *
 * Responsibilities
 * - Defines node/edge CSS (sizes, label positioning, images, selection states).
 * - Encodes visual vocabulary: note counts, colors, hover/selected outlines.
 *
 * Tips
 * - Mirror tokens in styles/tokens.js so colors/spacing stay consistent.
 * - Keep node label wrap/width aligned with NodeColorPicker/controls UX.
 */

import { COLORS, NODE_SIZES, BORDER } from "./styles/tokens.js";

// Parent container (holder) – invisible, grabbable, carries the domain ID.
const entryParentBase = {
  'background-opacity': 0,
  'border-width': 0,
  'shape': 'rectangle',
  'width': NODE_SIZES.regular.width,
  'height': NODE_SIZES.regular.height,
  'padding': 0,
  'label': '',
  'z-index-compare': 'manual',
  'z-index': 1,
};

const entryNodeBase = {
  "background-color": COLORS.gray.base,
  "border-color": COLORS.gray.base,
  "border-width": BORDER.width,
  "shape": "rectangle",
  "width": NODE_SIZES.regular.width,
  "height": NODE_SIZES.regular.height,
  // "transition-property": "height",
  // "transition-duration": "1s",
  // "transition-timing-function": "ease-in-out",

  // Text
  "label": "data(label)",
  "color": COLORS.text,
  "font-weight": "bold",
  "text-wrap": "wrap",
  "text-halign": "center",
  "text-valign": "center",
  "line-height": 1.1,
  "font-family": "monospace",

  // Enable manual z-index so note-count nodes (also manual) can layer above
  "z-index-compare": "manual",
  "z-index": 10,

  // Images: keep square aspect, centered horizontally, bottom aligned.
  "background-image": "data(imageUrl)",
  "background-repeat": "no-repeat"
};

// Text-only note count node (now fully transparent background & size variants handled below).
const noteCountBase = {
  'label': 'data(label)',
  'shape': 'rectangle',
  'padding': 0,
  'background-opacity': 0,
  'background-color': 'rgba(0,0,0,0)',
  'border-width': 0,
  'color': '#ffffff',
  'font-weight': 'bold',
  'text-wrap': 'none',
  'text-halign': 'center',
  'text-valign': 'center',
  'text-outline-color': 'rgba(0,0,0,0.9)',
  'z-index-compare': 'manual',
  'z-index': 9999,
  'events': 'no'
};

const sizeRules = [
  {
    selector: 'node.entry[size="regular"]',
    style: {
      "width": NODE_SIZES.regular.width,
      "height": NODE_SIZES.regular.height,
      "background-position-y": NODE_SIZES.regular["background-position-y"],
      "background-width": NODE_SIZES.regular["background-width"],
      "background-height": NODE_SIZES.regular["background-height"],
      "text-margin-y": NODE_SIZES.regular["text-margin-y"],
      "text-max-width": NODE_SIZES.regular["text-max-width"],
      "font-size": NODE_SIZES.regular["font-size"],
      "z-index": 12 // Regular nodes middle layer
    }
  },
  {
    selector: 'node.entry[size="double"]',
    style: {
      "width": NODE_SIZES.double.width,
      "height": NODE_SIZES.double.height,
      "background-position-y": NODE_SIZES.double["background-position-y"],
      "background-width": NODE_SIZES.double["background-width"],
      "background-height": NODE_SIZES.double["background-height"],
      "text-margin-y": NODE_SIZES.double["text-margin-y"],
      "text-max-width": NODE_SIZES.double["text-max-width"],
      "font-size": NODE_SIZES.double["font-size"],
      "z-index": 11 // Bottom layer (behind others)
    }
  },
  {
    selector: 'node.entry[size="half"]',
    style: {
      "width": NODE_SIZES.small.width,
      "height": NODE_SIZES.small.height,
      "background-position-y": NODE_SIZES.small["background-position-y"],
      "background-width": NODE_SIZES.small["background-width"],
      "background-height": NODE_SIZES.small["background-height"],
      "text-margin-y": NODE_SIZES.small["text-margin-y"],
      "text-max-width": NODE_SIZES.small["text-max-width"],
      "font-size": NODE_SIZES.small["font-size"],
      "z-index": 13 // Top among entry nodes
    }
  }
];

const colorRules = [
  { selector: 'node.entry[color="gray"]', style: { "background-color": COLORS.gray.base, "border-color": COLORS.gray.base } },
  { selector: 'node.entry[color="green"]', style: { "background-color": COLORS.green.base, "border-color": COLORS.green.base } },
  { selector: 'node.entry[color="orange"]', style: { "background-color": COLORS.orange.base, "border-color": COLORS.orange.base } },
  { selector: 'node.entry[color="purple"]', style: { "background-color": COLORS.purple.base, "border-color": COLORS.purple.base } },
  { selector: 'node.entry[color="red"]', style: { "background-color": COLORS.red.base, "border-color": COLORS.red.base } },
  { selector: 'node.entry[color="blue"]', style: { "background-color": COLORS.blue.base, "border-color": COLORS.blue.base } }
];

// Selected/active state is applied via classes added to the entry child when its parent is selected or grabbed.
const parentSelectionRules = [
  { selector: 'node.entry.parent-selected[color="gray"]', style: { "border-color": COLORS.gray.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.gray.bright } },
  { selector: 'node.entry.parent-selected[color="green"]', style: { "border-color": COLORS.green.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.green.bright } },
  { selector: 'node.entry.parent-selected[color="orange"]', style: { "border-color": COLORS.orange.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.orange.bright } },
  { selector: 'node.entry.parent-selected[color="purple"]', style: { "border-color": COLORS.purple.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.purple.bright } },
  { selector: 'node.entry.parent-selected[color="red"]', style: { "border-color": COLORS.red.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.red.bright } },
  { selector: 'node.entry.parent-selected[color="blue"]', style: { "border-color": COLORS.blue.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.blue.bright } },
  // Active / dragging highlight (slightly different opacity to differentiate if needed)
  { selector: 'node.entry.parent-active[color="gray"]', style: { "border-color": COLORS.gray.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.gray.bright } },
  { selector: 'node.entry.parent-active[color="green"]', style: { "border-color": COLORS.green.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.green.bright } },
  { selector: 'node.entry.parent-active[color="orange"]', style: { "border-color": COLORS.orange.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.orange.bright } },
  { selector: 'node.entry.parent-active[color="purple"]', style: { "border-color": COLORS.purple.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.purple.bright } },
  { selector: 'node.entry.parent-active[color="red"]', style: { "border-color": COLORS.red.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.red.bright } },
  { selector: 'node.entry.parent-active[color="blue"]', style: { "border-color": COLORS.blue.bright, "border-width": BORDER.selectedWidth, "background-color": COLORS.blue.bright } }
];

const edgeBase = [
  {
    selector: 'edge',
    style: {
      "line-style": "solid",
      "width": 5,
      "line-color": COLORS.edge,
      "curve-style": "bezier",
      "arrow-scale": 2.5,
      // 👇 this is the "second, thicker line" underneath
      'underlay-color': 'gray',    // your “border” color
      'underlay-opacity': 1,
      'underlay-padding': 5,       // how much thicker than the line (px)
    }
  },
  {
    selector: 'edge[direction="forward"]',
    style: {
      "mid-target-arrow-shape": "chevron",
      "mid-target-arrow-color": COLORS.edge
    }
  },
  {
    selector: 'edge[direction="backward"]',
    style: {
      "mid-source-arrow-shape": "chevron",
      "mid-source-arrow-color": COLORS.edge
    }
  },
  {
    selector: 'edge[direction="bidirectional"]',
    style: {
      "mid-source-arrow-shape": "chevron",
      "mid-target-arrow-shape": "chevron",
      "mid-source-arrow-color": COLORS.edge,
      "mid-target-arrow-color": COLORS.edge
    }
  },
  {
    selector: 'edge:active',
    style: {
      "line-color": "lightgray",
      "mid-target-arrow-color": "lightgray",
      "mid-source-arrow-color": "lightgray",
      "arrow-scale": 3
    }
  },
  {
    selector: 'edge:selected',
    style: {
      "line-color": "lightgray",
      "mid-target-arrow-color": "lightgray",
      "mid-source-arrow-color": "lightgray",
      "arrow-scale": 3
    }
  }
];

// --- Note count overlay styles ---
const noteCountRules = [
  { selector: 'node.note-count', style: noteCountBase },
  // Size variants (inherit base, override size + font + outline width)
  { selector: 'node.note-count[size="double"]', 
    style: { 'width': NODE_SIZES.double.width, 
      'height': NODE_SIZES.double.height, 
      'font-size': 180, 
      'text-outline-width': 4,
      'text-margin-y': NODE_SIZES.double['background-position-y'] / 2
    } },
  { selector: 'node.note-count[size="regular"]', 
    style: { 'width': NODE_SIZES.regular.width, 
      'height': NODE_SIZES.regular.height, 
      'font-size': 80, 
      'text-outline-width': 3,
      'text-margin-y': NODE_SIZES.regular['background-position-y'] / 2
    } },
  { selector: 'node.note-count[size="half"]', 
    style: { 'width': NODE_SIZES.small.width, 
      'height': NODE_SIZES.small.height, 
      'font-size': 48, 
      'text-outline-width': 2,
      'text-margin-y': NODE_SIZES.small['background-position-y'] / 2
    } },
  { selector: 'node.note-count.hidden', 
    style: { 'display': 'none' } },
  
    // EDGE NOTE COUNT NODES
  { selector: 'node.edge-note-count', style: noteCountBase },
  { selector: 'node.edge-note-count', 
    style: { 'width': NODE_SIZES.regular.width, 
      'height': NODE_SIZES.regular.height, 
      'font-size': 80, 
      'text-outline-width': 3,
      'text-margin-y': NODE_SIZES.regular['background-position-y'] / 2
    } },
  { selector: 'node.edge-note-count.hidden', 
    style: { 'display': 'none' } }
];

// --- Drag state styles to ensure proper z-ordering ---
const dragStateRules = [
  // Keep entry nodes at lower z-index even when being dragged
  { 
    selector: 'node.entry:grabbed', 
    style: { 
      'z-index': -1,  // Higher than normal but much lower than note-count nodes
      // 'background-color': 'blue', // Slight highlight for visibility
      // 'opacity': 0.5, // this demonstrates that the child node is being dragged simultaneously underneath
      // 'z-compound-depth': 'bottom'
    } 
  },
  // Ensure note-count nodes always stay on top, even during parent drag
  { 
    selector: 'node.note-count', 
    style: { 
      'z-index': 9999,
      // 'z-index-compare': 'manual',
      // 'z-compound-depth': 'top'
    } 
  }
];

// Inject parent specific size rules mirroring original entry sizes so the parent bbox matches child
const parentSizeRules = [
  {
    selector: 'node.entry-parent[size="regular"]',
    style: { 'width': NODE_SIZES.regular.width, 'height': NODE_SIZES.regular.height }
  },
  {
    selector: 'node.entry-parent[size="double"]',
    style: { 'width': NODE_SIZES.double.width, 'height': NODE_SIZES.double.height }
  },
  {
    selector: 'node.entry-parent[size="half"]',
    style: { 'width': NODE_SIZES.small.width, 'height': NODE_SIZES.small.height }
  }
];

// Ensure entry child nodes ignore pointer events so dragging/selecting hits the parent container
const entryChildInteractionRule = {
  selector: 'node.entry',
  style: { 'events': 'no',
          'overlay-opacity': 0 // Disable default overlay to avoid changing color on focus/active
   }
};

const animationRules = [
  // New nodes start at zero height via CSS class
  {
    selector: 'node.entry.node-entering',
    style: {
      'height': 0,
      'transition-property': 'height',
      'transition-duration': '300ms',
      'transition-timing-function': 'ease-out'
    }
  },
  // Add transition to the base entry node style
  {
    selector: 'node.entry',
    style: {
      // Normal height rules already defined in sizeRules, so this just ensures transition
      'transition-property': 'height width background-position-y background-width background-height text-margin-y font-size',
      'transition-duration': '300ms', 
      'transition-timing-function': 'ease-out'
    }
  },
  {
    selector: '.search-glow',
    style: {
      'border-width': 7,
      'border-color': '#ffd700',           // golden outline
      'transition-property': 'border-width, border-color',
      'transition-duration': '400ms',
      'transition-timing-function': 'ease-in-out'
    }
  }
];

// Base style for unseen badges (shared between node and edge badges)
const unseenBadgeBase = {
  'label': 'data(label)',
  'shape': 'ellipse',
  'width': 32,
  'height': 32,
  'background-color': 'transparent',
  'background-opacity': 0,
  'border-width': 3,
  'border-color': '#ffffff',          // White border for contrast
  'border-opacity': 1,
  'color': '#ffffff',                 // White text
  'font-weight': 'bold',
  'font-size': '30px',
  "text-margin-y": 2,
  'text-halign': 'center',
  'text-valign': 'center',
  'z-index-compare': 'manual',
  'z-index': 10000,                   // Higher than note count badges
  'events': 'no'                      // Don't interfere with interactions
};

// Unseen badge rules
const unseenBadgeRules = [
  {
    selector: 'node.unseen',
    style: {
      ...unseenBadgeBase,
      // Position relative to parent entry node
    }
  },
  {
    selector: 'node.edge-unseen',
    style: {
      ...unseenBadgeBase,
      // Position relative to edge midpoint
    }
  },
  // Hidden state for unseen badges
  {
    selector: 'node.unseen.hidden',
    style: { 'display': 'none' }
  },
  {
    selector: 'node.edge-unseen.hidden',
    style: { 'display': 'none' }
  }
];

const badgeRules = [
  { selector: 'node.note-count', style: noteCountBase },
  { selector: 'node.edge-note-count', style: noteCountBase },
  
  // Unseen badges (new)
  ...unseenBadgeRules
];

// Background image node - giant locked node that renders behind everything
const backgroundImageNodeRule = {
  selector: 'node.background-image-node',
  style: {
    'shape': 'rectangle',
    'background-image': 'data(imageUrl)',
    'background-fit': 'contain',
    'background-opacity': 1,
    'opacity': 'data(opacity)',
    'border-width': 0,
    'label': '',
    'z-index-compare': 'manual',
    'z-index': -1, // Below everything
    'events': 'no', // Not interactive
    'overlay-opacity': 0 // No selection overlay
  }
};

const cytoscapeStyles = [
  backgroundImageNodeRule, // Must be first so it's below everything
  { selector: 'node.entry-parent', style: entryParentBase },
  { selector: 'node.entry', style: entryNodeBase },
  ...sizeRules,
  ...colorRules,
  ...parentSelectionRules,
  ...edgeBase,
  ...noteCountRules,
  ...dragStateRules,
  ...parentSizeRules,
  ...animationRules,
  ...badgeRules,
  entryChildInteractionRule
];

export default cytoscapeStyles;
