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
const DARK_GRAY = "#424242"; // Dark gray
const GRAY = "#9E9E9E"; // Gray

const cytoscapeStyles = [
  // Base node style - default gray
  {
    selector: "node",
    style: {
      "background-color": DARK_GRAY, // Default gray
      "label": "data(label)",
      "color": "#fff", // White text
      "text-valign": "center",
      "text-halign": "center",
      "text-margin-y": -61, // Position text near top
      "width": 120, // Regular size
      "height": 175,
      "font-size": 15,
      "line-height": 1.1,
      "font-weight": "bold",
      "font-family": "monospace",
      "text-wrap": "wrap",
      "text-max-width": 115,
      "shape": "rectangle",
      "border-width": 5,
      "border-color": DARK_GRAY,
      "background-image": "data(icon)",
      "background-repeat": "no-repeat",
      "background-position-y": "52px",
      "background-width": "120px",
      "background-height": "120px"
    }
  },
  // Color-specific node styles (unselected/dimmed)
  {
    selector: 'node[color="gray"]',
    style: {
      "background-color": DARK_GRAY,
      "border-color": DARK_GRAY
    }
  },
  {
    selector: 'node[color="green"]',
    style: {
      "background-color": GRAY_GREEN,
      "border-color": GRAY_GREEN
    }
  },
  {
    selector: 'node[color="orange"]',
    style: {
      "background-color": BURNT_ORANGE,
      "border-color": BURNT_ORANGE
    }
  },
  {
    selector: 'node[color="purple"]',
    style: {
      "background-color": PURPLE,
      "border-color": PURPLE
    }
  },
  {
    selector: 'node[color="red"]',
    style: {
      "background-color": DARK_RED,
      "border-color": DARK_RED
    }
  },
  {
    selector: 'node[color="blue"]',
    style: {
      "background-color": DARK_BLUE,
      "border-color": DARK_BLUE
    }
  },
  // Double size nodes
  {
    selector: 'node[size="double"]',
    style: {
      "width": 240,
      "height": 340,
      "font-size": 30,
      "line-height": 1.1,
      "text-max-width": 230,
      "text-margin-y": -118,
      "background-width": "240px", // Proportionally larger square
      "background-height": "240px",
      "background-position-y": "100px",
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
      "text-margin-y": -38,
      "background-width": "75px", // Proportionally smaller square
      "background-height": "75px",
      "background-repeat": "no-repeat",
      "background-position-y": "42px",
    }
  },
  // Selected node styles - bright colors when selected
  {
    selector: 'node:selected',
    style: {
      "border-width": 7,
      "border-color": "#4fc3f7",
      "opacity": 1
    }
  },
  {
    selector: 'node[color="gray"]:selected',
    style: {
      "background-color": GRAY,
      "border-color": GRAY
    }
  },
  {
    selector: 'node[color="green"]:selected',
    style: {
      "background-color": GREEN,
      "border-color": GREEN
    }
  },
  {
    selector: 'node[color="orange"]:selected',
    style: {
      "background-color": ORANGE,
      "border-color": ORANGE
    }
  },
  {
    selector: 'node[color="purple"]:selected',
    style: {
      "background-color": BRIGHT_PURPLE,
      "border-color": BRIGHT_PURPLE
    }
  },
  {
    selector: 'node[color="red"]:selected',
    style: {
      "background-color": RED,
      "border-color": RED
    }
  },
  {
    selector: 'node[color="blue"]:selected',
    style: {
      "background-color": BLUE,
      "border-color": BLUE
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
      "curve-style": "bezier",
      "arrow-scale": 1.5
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
