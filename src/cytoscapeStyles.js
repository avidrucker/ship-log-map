// src/cytoscapeStyles.js
import { COLORS, NODE_SIZES, BORDER } from "./styles/tokens.js";

const baseNode = {
  "background-color": COLORS.gray.base,
  "border-color": COLORS.gray.base,
  "border-width": BORDER.width,
  "shape": "rectangle",
  "width": NODE_SIZES.regular.width,
  "height": NODE_SIZES.regular.height,

  // Text
  "label": "data(label)",
  "color": COLORS.text,
  "font-weight": "bold",
  "text-wrap": "wrap",
  "text-halign": "center",
  "text-valign": "center",
  "line-height": 1.1,
  "font-family": "monospace",

  // Images: keep square aspect, centered horizontally, bottom aligned.
  "background-image": "data(imageUrl)",
  "background-repeat": "no-repeat"
};

const sizeRules = [
  {
    selector: 'node[size="regular"]',
    style: {
      "width": NODE_SIZES.regular.width,
      "height": NODE_SIZES.regular.height,
      "background-position-y": NODE_SIZES.regular["background-position-y"],
      "background-width": NODE_SIZES.regular["background-width"],
      "background-height": NODE_SIZES.regular["background-height"],
      "text-margin-y": NODE_SIZES.regular["text-margin-y"],
      "text-max-width": NODE_SIZES.regular["text-max-width"],
      "font-size": NODE_SIZES.regular["font-size"],
      "z-index": 2 // Regular nodes in middle layer
    }
  },
  {
    selector: 'node[size="double"]',
    style: {
      "width": NODE_SIZES.double.width,
      "height": NODE_SIZES.double.height,
      "background-position-y": NODE_SIZES.double["background-position-y"],
      "background-width": NODE_SIZES.double["background-width"],
      "background-height": NODE_SIZES.double["background-height"],
      "text-margin-y": NODE_SIZES.double["text-margin-y"],
      "text-max-width": NODE_SIZES.double["text-max-width"],
      "font-size": NODE_SIZES.double["font-size"],
      "z-index": 1 // Double nodes on bottom (rendered first, appear behind)
    }
  },
  {
    selector: 'node[size="half"]',
    style: {
      "width": NODE_SIZES.small.width,
      "height": NODE_SIZES.small.height,
      "background-position-y": NODE_SIZES.small["background-position-y"],
      "background-width": NODE_SIZES.small["background-width"],
      "background-height": NODE_SIZES.small["background-height"],
      "text-margin-y": NODE_SIZES.small["text-margin-y"],
      "text-max-width": NODE_SIZES.small["text-max-width"],
      "font-size": NODE_SIZES.small["font-size"],
      "z-index": 3 // Half nodes on top (rendered last, appear in front)
    }
  }
];

const colorRules = [
  {
    selector: 'node[color="gray"]',
    style: { "background-color": COLORS.gray.base, "border-color": COLORS.gray.base }
  },
  {
    selector: 'node[color="green"]',
    style: { "background-color": COLORS.green.base, "border-color": COLORS.green.base }
  },
  {
    selector: 'node[color="orange"]',
    style: { "background-color": COLORS.orange.base, "border-color": COLORS.orange.base }
  },
  {
    selector: 'node[color="purple"]',
    style: { "background-color": COLORS.purple.base, "border-color": COLORS.purple.base }
  },
  {
    selector: 'node[color="red"]',
    style: { "background-color": COLORS.red.base, "border-color": COLORS.red.base }
  },
  {
    selector: 'node[color="blue"]',
    style: { "background-color": COLORS.blue.base, "border-color": COLORS.blue.base }
  }
];

// Selected border uses the bright variant of the node’s color.
const selectedRules = [
  { selector: 'node:selected[color="gray"]',   
    style: {  "border-color": COLORS.gray.bright,   
              "border-width": BORDER.selectedWidth,
              "background-color": COLORS.gray.bright } },
  { selector: 'node:selected[color="green"]',  
    style: { "border-color": COLORS.green.bright,  
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.green.bright } },
  { selector: 'node:selected[color="orange"]', 
    style: { "border-color": COLORS.orange.bright, 
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.orange.bright } },
  { selector: 'node:selected[color="purple"]', 
    style: { "border-color": COLORS.purple.bright, 
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.purple.bright } },
  { selector: 'node:selected[color="red"]',    
    style: { "border-color": COLORS.red.bright,    
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.red.bright } },
  { selector: 'node:selected[color="blue"]',   
    style: { "border-color": COLORS.blue.bright,   
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.blue.bright } }
];

const activeRules = [
  { selector: 'node:active[color="gray"]',   
    style: {  "border-color": COLORS.gray.bright,   
              "border-width": BORDER.selectedWidth,
              "background-color": COLORS.gray.bright } },
  { selector: 'node:active[color="green"]',  
    style: { "border-color": COLORS.green.bright,  
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.green.bright } },
  { selector: 'node:active[color="orange"]', 
    style: { "border-color": COLORS.orange.bright, 
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.orange.bright } },
  { selector: 'node:active[color="purple"]', 
    style: { "border-color": COLORS.purple.bright, 
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.purple.bright } },
  { selector: 'node:active[color="red"]',    
    style: { "border-color": COLORS.red.bright,    
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.red.bright } },
  { selector: 'node:active[color="blue"]',   
    style: { "border-color": COLORS.blue.bright,   
      "border-width": BORDER.selectedWidth, 
      "background-color": COLORS.blue.bright } }
]

const edgeBase = [
  {
    selector: 'edge',
    style: {
      "line-style": "solid",
      "width": 5,
      "line-color": COLORS.edge,
      "curve-style": "bezier",
      "arrow-scale": 1.5,
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
      "arrow-scale": 1.5
    }
  },
  {
    selector: 'edge:selected',
    style: {
      "line-color": "lightgray",
      "mid-target-arrow-color": "lightgray",
      "mid-source-arrow-color": "lightgray",
      "arrow-scale": 2
    }
  }
];

const cytoscapeStyles = [
  { selector: 'node', style: baseNode },
  ...sizeRules,
  ...colorRules,
  ...selectedRules,
  ...activeRules,
  ...edgeBase
];

export default cytoscapeStyles;
