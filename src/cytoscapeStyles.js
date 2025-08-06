const cytoscapeStyles = [
  // Base node style
  {
    selector: "node",
    style: {
      "background-color": "#CD5C5C", // Dark burnt orange
      "label": "data(label)",
      "color": "#fff", // White text
      "text-valign": "top",
      "text-halign": "center",
      "text-margin-y": 8, // Position text near top
      "width": 120, // Regular size
      "height": 160,
      "font-size": 20,
      "font-weight": "bold",
      "text-wrap": "wrap",
      "text-max-width": 110,
      "shape": "rectangle",
      "border-width": 2,
      "border-color": "#8B0000", // Darker border
      "background-image": "data(icon)",
      "background-fit": "contain",
      "background-position-x": "50%",
      "background-position-y": "80%", // Position icon near bottom
      "background-width": "60%",
      "background-height": "40%"
    }
  },
  // Double size nodes
  {
    selector: 'node[size="double"]',
    style: {
      "width": 240,
      "height": 320,
      "font-size": 30,
      "text-max-width": 220,
      "text-valign": "top",
      "text-margin-y": 75
    }
  },
  // Half size nodes
  {
    selector: 'node[size="half"]',
    style: {
      "width": 80,
      "height": 100,
      "font-size": 16,
      "text-max-width": 70,
      "text-margin-y": 6,
      "background-width": "50%",
      "background-height": "35%"
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
