const cytoscapeStyles = [
  {
    selector: "node",
    style: {
      "background-color": "#888",
      "label": "data(label)",
      "color": "#fff",
      "text-valign": "center",
      "text-outline-width": 2,
      "text-outline-color": "#222",
      "width": 90,
      "height": 120,
      "font-size": 14,
      "text-wrap": "wrap",
      "text-max-width": 90,
      "shape": "rectangle"
    }
  },
  {
    selector: 'node[state="rumor"]',
    style: { "background-color": "gold" }
  },
  {
    selector: 'node[state="complete"]',
    style: { "background-color": "blue" }
  },
  {
    selector: 'node[state="undiscovered"]',
    style: { "background-color": "gray" }
  },
  {
    selector: 'edge[type="rumor"]',
    style: { "line-style": "dotted", "width": 2, "line-color": "#ccc" }
  },
  {
    selector: 'edge[type="direct"]',
    style: { "line-style": "solid", "width": 3, "line-color": "#fff" }
  }
];

export default cytoscapeStyles;
