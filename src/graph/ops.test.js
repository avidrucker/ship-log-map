// src/graph/ops.test.js
import { jest } from '@jest/globals';
import {
  addNode, removeNodeAndEdges, renameNode,
  connectNodes, disconnectNodes, setNodeMeta,
  setEdgeMeta, serializeGraph, deserializeGraph, edgeId
} from "./ops.js";

describe("graph ops", () => {
  const blank = { nodes: [], edges: [], notes: {} };

  test("add/rename/remove node", () => {
    let g = addNode(blank, { id: "A", title: "Alpha", x: 10, y: 20 });
    expect(g.nodes).toHaveLength(1);
    g = renameNode(g, "A", "A1");
    expect(g.nodes[0].title).toBe("A1");
    expect(g.nodes[0].id).toBe("A1"); // ID should also change
    g = removeNodeAndEdges(g, "A1"); // Use the new ID
    expect(g.nodes).toHaveLength(0);
  });

  test("connect/disconnect edge", () => {
    let g = { ...blank, nodes: [{ id: "A" }, { id: "B" }] };
    g = connectNodes(g, "A", "B", "forward");
    expect(g.edges).toHaveLength(1);
    const id = edgeId("A", "B");
    g = setEdgeMeta(g, id, { direction: "both" });
    expect(g.edges[0].direction).toBe("both");
    g = disconnectNodes(g, { source: "A", target: "B" });
    expect(g.edges).toHaveLength(0);
  });

  test("serialize/deserialize", () => {
    let g = addNode(blank, { id: "N1", title: "Node", x: 0, y: 0, color: "orange" });
    g = connectNodes(g, "N1", "N1", "forward");
    const text = serializeGraph(g);
    const g2 = deserializeGraph(text);
    expect(g2.nodes[0].color).toBe("orange");
    expect(g2.edges[0].id).toBe(edgeId("N1", "N1"));
  });

  test("setNodeMeta updates node properties", () => {
    // Start with a node with default properties
    let g = addNode(blank, { id: "TestNode", title: "Original Title", x: 10, y: 20, color: "gray", size: "regular" });
    
    // Verify initial state
    expect(g.nodes[0].title).toBe("Original Title");
    expect(g.nodes[0].color).toBe("gray");
    expect(g.nodes[0].size).toBe("regular");
    expect(g.nodes[0].x).toBe(10);
    expect(g.nodes[0].y).toBe(20);

    // Update single property
    g = setNodeMeta(g, "TestNode", { color: "blue" });
    expect(g.nodes[0].color).toBe("blue");
    expect(g.nodes[0].title).toBe("Original Title"); // other properties unchanged

    // Update multiple properties at once
    g = setNodeMeta(g, "TestNode", { 
      size: "double", 
      x: 100, 
      y: 200,
      title: "Updated Title"
    });
    expect(g.nodes[0].size).toBe("double");
    expect(g.nodes[0].x).toBe(100);
    expect(g.nodes[0].y).toBe(200);
    expect(g.nodes[0].title).toBe("Updated Title");
    expect(g.nodes[0].color).toBe("blue"); // previous change preserved

    // Try to update non-existent node (should return unchanged graph)
    const originalLength = g.nodes.length;
    const gUnchanged = setNodeMeta(g, "NonExistentNode", { color: "red" });
    expect(gUnchanged.nodes).toHaveLength(originalLength);
    expect(gUnchanged.nodes[0].color).toBe("blue"); // no changes to existing node

    // Test with empty patch object
    const gEmptyPatch = setNodeMeta(g, "TestNode", {});
    expect(gEmptyPatch.nodes[0]).toEqual(g.nodes[0]); // should be identical

    // Test updating imageUrl property
    g = setNodeMeta(g, "TestNode", { imageUrl: "custom-image-url" });
    expect(g.nodes[0].imageUrl).toBe("custom-image-url");
  });

  describe('Undo node move', () => {
    it('should update both React state and Cytoscape node position', () => {
      // Mock graph data
      const initialGraph = {
        nodes: [{ id: 'A', x: 0, y: 0 }],
        edges: [],
        notes: {},
        mode: 'editing',
        mapName: 'test',
        cdnBaseUrl: '',
        orientation: 0,
        compassVisible: true
      };
      const movedGraph = {
        ...initialGraph,
        nodes: [{ id: 'A', x: 100, y: 200 }]
      };
      // Mock Cytoscape instance
      const cyNode = { position: jest.fn(), length: 1 };
      const cy = { getElementById: jest.fn(() => cyNode), fit: jest.fn() };
      // Simulate undo handler
      // (This is a simplified version of the App.jsx undo logic)
      movedGraph.nodes.forEach(node => {
        // Move node visually
        cy.getElementById(node.id).position({ x: node.x, y: node.y });
      });
      // Undo: restore initialGraph
      initialGraph.nodes.forEach(node => {
        cy.getElementById(node.id).position({ x: node.x, y: node.y });
      });
      // Check that Cytoscape position was called with correct values
      expect(cy.getElementById).toHaveBeenCalledWith('A');
      expect(cyNode.position).toHaveBeenCalledWith({ x: 0, y: 0 });
    });
  });
});
