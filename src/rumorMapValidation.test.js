/**
 * Jest tests for rumor map validation functions
 * Run with: npm test
 */

import { 
  validateNode, 
  validateEdge, 
  validateRumorMap, 
  parseAndValidateRumorMap 
} from './rumorMapValidation.js';

describe('validateNode', () => {
  test('should validate a correct node', () => {
    const validNode = {
      id: "test_node",
      title: "Test Node",
      state: "complete",
      x: 100,
      y: 200
    };
    
    const result = validateNode(validNode);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject node with empty id', () => {
    const invalidNode = {
      id: "",
      title: "Test Node",
      state: "complete",
      x: 100,
      y: 200
    };
    
    const result = validateNode(invalidNode);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Node must have a non-empty string id');
  });

  test('should reject node with invalid state', () => {
    const invalidNode = {
      id: "test_node",
      title: "Test Node",
      state: "invalid_state",
      x: 100,
      y: 200
    };
    
    const result = validateNode(invalidNode);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Node state must be one of: complete, rumor, undiscovered');
  });

  test('should reject node with non-numeric coordinates', () => {
    const invalidNode = {
      id: "test_node",
      title: "Test Node",
      state: "complete",
      x: "not_a_number",
      y: 200
    };
    
    const result = validateNode(invalidNode);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Node must have a valid number x coordinate');
  });

  test('should reject non-object input', () => {
    const result = validateNode(null);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Node must be an object');
  });
});

describe('validateEdge', () => {
  test('should validate a correct edge', () => {
    const validEdge = {
      source: "node1",
      target: "node2",
      type: "rumor"
    };
    
    const result = validateEdge(validEdge, ["node1", "node2"]);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject self-loop edge', () => {
    const invalidEdge = {
      source: "node1",
      target: "node1",
      type: "rumor"
    };
    
    const result = validateEdge(invalidEdge, ["node1"]);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Edge cannot connect a node to itself (self-loop)');
  });

  test('should reject edge with invalid source reference', () => {
    const invalidEdge = {
      source: "nonexistent_node",
      target: "node2",
      type: "rumor"
    };
    
    const result = validateEdge(invalidEdge, ["node1", "node2"]);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Edge source "nonexistent_node" does not reference a valid node');
  });

  test('should reject edge with invalid type', () => {
    const invalidEdge = {
      source: "node1",
      target: "node2",
      type: "invalid_type"
    };
    
    const result = validateEdge(invalidEdge, ["node1", "node2"]);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Edge type must be one of: rumor, direct');
  });
});

describe('validateRumorMap', () => {
  test('should validate a correct map', () => {
    const validMap = {
      nodes: [
        { id: "node1", title: "Node 1", state: "complete", x: 0, y: 0 },
        { id: "node2", title: "Node 2", state: "rumor", x: 100, y: 0 }
      ],
      edges: [
        { source: "node1", target: "node2", type: "rumor" }
      ]
    };
    
    const result = validateRumorMap(validMap);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject map with duplicate node IDs', () => {
    const invalidMap = {
      nodes: [
        { id: "node1", title: "Node 1", state: "complete", x: 0, y: 0 },
        { id: "node1", title: "Node 1 Duplicate", state: "rumor", x: 100, y: 0 }
      ],
      edges: []
    };
    
    const result = validateRumorMap(invalidMap);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Duplicate node ID "node1" found');
  });

  test('should reject map without nodes array', () => {
    const invalidMap = {
      edges: []
    };
    
    const result = validateRumorMap(invalidMap);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Map must have a nodes array');
  });

  test('should reject map with empty nodes array', () => {
    const invalidMap = {
      nodes: [],
      edges: []
    };
    
    const result = validateRumorMap(invalidMap);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Map must contain at least one node');
  });

  test('should reject map with duplicate edges', () => {
    const invalidMap = {
      nodes: [
        { id: "node1", title: "Node 1", state: "complete", x: 0, y: 0 },
        { id: "node2", title: "Node 2", state: "rumor", x: 100, y: 0 }
      ],
      edges: [
        { source: "node1", target: "node2", type: "rumor" },
        { source: "node1", target: "node2", type: "direct" }
      ]
    };
    
    const result = validateRumorMap(invalidMap);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Duplicate edge from "node1" to "node2" found');
  });
});

describe('parseAndValidateRumorMap', () => {
  test('should parse and validate correct JSON', () => {
    const validMap = {
      nodes: [
        { id: "node1", title: "Node 1", state: "complete", x: 0, y: 0 }
      ],
      edges: []
    };
    const validJsonString = JSON.stringify(validMap);
    
    const result = parseAndValidateRumorMap(validJsonString);
    expect(result.isValid).toBe(true);
    expect(result.data).toEqual(validMap);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject invalid JSON', () => {
    const invalidJsonString = '{ invalid json }';
    
    const result = parseAndValidateRumorMap(invalidJsonString);
    expect(result.isValid).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errors[0]).toMatch(/Invalid JSON:/);
  });

  test('should reject valid JSON with invalid map structure', () => {
    const invalidMapString = JSON.stringify({ invalidStructure: true });
    
    const result = parseAndValidateRumorMap(invalidMapString);
    expect(result.isValid).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errors).toContain('Map must have a nodes array');
  });
});
