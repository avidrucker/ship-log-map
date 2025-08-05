import React, { useEffect, useRef } from "react";
import cytoscape from "cytoscape";

const CytoscapeGraph = ({ graphData }) => {
  const cyRef = useRef(null);
  const instanceRef = useRef(null); // To prevent multiple Cytoscape initializations

  useEffect(() => {
    if (!cyRef.current) return;  // Wait until div is mounted
    if (instanceRef.current) {
      instanceRef.current.destroy(); // Clean up any previous instance
    }

    const elements = [
      ...graphData.nodes.map(n => ({
        data: { id: n.id, label: n.title, state: n.state }
      })),
      ...graphData.edges.map(e => ({
        data: { source: e.source, target: e.target, type: e.type }
      }))
    ];

    instanceRef.current = cytoscape({
      container: cyRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#888",
            "label": "data(label)",
            "color": "#fff",
            "text-valign": "center",
            "text-outline-width": 2,
            "text-outline-color": "#222",
            "width": 80,
            "height": 80,
            "font-size": 12
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
      ],
      layout: { name: "cose", animate: true }
    });

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, [graphData]);

  return <div ref={cyRef} style={{ width: "100vw", height: "100vh" }}></div>;
};

export default CytoscapeGraph;
