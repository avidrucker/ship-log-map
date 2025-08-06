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
      "text-margin-y": -50, // Position text near top
      "width": 120, // Regular size
      "height": 160,
      "font-size": 18,
      "font-weight": "bold",
      "text-wrap": "wrap",
      "text-max-width": 110,
      "shape": "rectangle",
      "border-width": 2,
      "border-color": "white", // Darker border
      "background-image": "data(icon)",
      "background-repeat": "no-repeat",
      "background-position-y": "100%", // Center horizontally, position vertically
      "background-width": "110", // Square size that should fit well
      "background-height": "110px" // Square size that should fit well
    }
  },
  // Double size nodes
  {
    selector: 'node[size="double"]',
    style: {
      "width": 240,
      "height": 300,
      "font-size": 30,
      "text-max-width": 220,
      "text-margin-y": -104,
      "background-width": "220px", // Proportionally larger square
      "background-height": "220px",
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
      "text-max-width": 70,
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
      "border-width": 4,
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
      "border-width": 3
    }
  },
  // Edge styles with arrows
  {
    selector: 'edge[direction="forward"]',
    style: {
      "line-style": "solid",
      "width": 3,
      "line-color": "#fff",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#fff",
      "curve-style": "bezier"
    }
  },
  {
    selector: 'edge[direction="backward"]',
    style: {
      "line-style": "solid",
      "width": 3,
      "line-color": "#fff",
      "source-arrow-shape": "triangle",
      "source-arrow-color": "#fff",
      "curve-style": "bezier"
    }
  },
  {
    selector: 'edge[direction="bidirectional"]',
    style: {
      "line-style": "solid",
      "width": 3,
      "line-color": "#fff",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#fff",
      "source-arrow-shape": "triangle",
      "source-arrow-color": "#fff",
      "curve-style": "bezier"
    }
  },
  // Selected edge styles
  {
    selector: 'edge:selected',
    style: {
      "line-color": "#ff6b6b",
      "target-arrow-color": "#ff6b6b",
      "source-arrow-color": "#ff6b6b",
      "width": 5,
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
      "width": 4
    }
  }
];

export default cytoscapeStyles;
