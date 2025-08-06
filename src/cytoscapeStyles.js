const GRAY_GREEN = "#376933"; // Gray green
const GREEN = "#4CAF50"; // Green
const BURNT_ORANGE = "#7d3d15"; // Dark burnt orange
const ORANGE = "#FF5722"; // Orange
const PURPLE = "#6a0dad"; // Purple
const BRIGHT_PURPLE = "#9c27b0"; // Bright purple
const DARK_RED = "#CD5C5C"; // Dark red
const RED = "#FF5722"; // Red
const DARK_BLUE = "#1a237e"; // Dark blue
const BLUE = "#2196F3"; // Blue

const cytoscapeStyles = [
  // Base node style
  {
    selector: "node",
    style: {
      "background-color": "#CD5C5C", // Dark burnt orange
      "label": "data(label)",
      "color": "#fff", // White text
      "text-valign": "center",
      "text-halign": "center",
      "text-margin-y": -58, // Position text near top
      "width": 120, // Regular size
      "height": 168,
      "font-size": 15,
      "line-height": 1.15,
      "font-weight": "bold",
      "font-family": "monospace",
      "text-wrap": "wrap",
      "text-max-width": 115,
      "shape": "rectangle",
      "border-width": 5,
      "border-color": "white", // Darker border
      "background-image": "data(icon)",
      "background-repeat": "no-repeat",
      "background-position-y": "45px", // Center horizontally, position vertically
      "background-width": "120px", // Square size that should fit well
      "background-height": "120px" // Square size that should fit well
    }
  },
  // Double size nodes
  {
    selector: 'node[size="double"]',
    style: {
      "width": 240,
      "height": 310,
      "font-size": 30,
      "line-height": 1.25,
      "text-max-width": 230,
      "text-margin-y": -110,
      "background-width": "240px", // Proportionally larger square
      "background-height": "240px",
      "background-position-y": "80px",
      "background-repeat": "no-repeat",
    }
  },
  // Half size nodes
  {
    selector: 'node[size="half"]',
    style: {
      "width": 80,
      "height": 120,
      "font-size": 12,
      "line-height": 1.05,
      "text-max-width": 78,
      "text-margin-y": -36,
      "background-width": "75px", // Proportionally smaller square
      "background-height": "75px",
      "background-repeat": "no-repeat",
    }
  },
  // Selected node styles
  {
    selector: 'node:selected',
    style: {
      "border-width": 7,
      "border-color": "#4fc3f7",
      "background-color": "#E67E22", // Slightly different orange for selected
      "opacity": 1
    }
  },
  // Hover effect for nodes
  {
    selector: 'node:active',
    style: {
      "border-color": "#ffdd59",
      "border-width": 6
    }
  },
  // Edge styles with arrows
  {
    selector: 'edge',
    style: {
      "line-style": "solid",
      "width": 5,
      "line-color": "#fff",
      "curve-style": "bezier"
    }
  },
  {
    selector: 'edge[direction="forward"]',
    style: {
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#fff",
    }
  },
  {
    selector: 'edge[direction="backward"]',
    style: {
      "source-arrow-shape": "triangle",
      "source-arrow-color": "#fff"
    }
  },
  {
    selector: 'edge[direction="bidirectional"]',
    style: {
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#fff",
      "source-arrow-shape": "triangle",
      "source-arrow-color": "#fff",
    }
  },
  // Selected edge styles
  {
    selector: 'edge:selected',
    style: {
      "line-color": "#ff6b6b",
      "target-arrow-color": "#ff6b6b",
      "source-arrow-color": "#ff6b6b",
      "width": 7,
      "opacity": 1
    }
  },
  // Hover effect for edges
  {
    selector: 'edge:active',
    style: {
      "line-color": "#ffdd59",
      "target-arrow-color": "#ffdd59",
      "source-arrow-color": "#ffdd59",
      "width": 7
    }
  }
];

export default cytoscapeStyles;
