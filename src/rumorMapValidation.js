// src/rumorMapValidation.js

/**
 * Rumor Map Schema Validation
 *
 * Responsibilities
 * - Validate imported JSON against project’s expected graph schema.
 * - Normalize/repair minor shape issues where safe (e.g., missing fields).
 * - Surface actionable errors for users when import fails.
 *
 * Exports
 * - loadAndValidateRumorMapFromFile(file): Promise<{nodes, edges, meta}>
 * - validateRumorMap(obj): { valid, errors[], normalized }
 *
 * Gotchas
 * - Never mutate caller data structures—return normalized copies.
 */

/**
 * Validation functions for Rumor Map data structures
 * These functions can be unit tested to ensure data integrity
 */

/**
 * Validates if a given object is a valid rumor map node
 * @param {any} node - The object to validate
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
export function validateNode(node) {
  const errors = [];
  
  if (!node || typeof node !== 'object') {
    return { isValid: false, errors: ['Node must be an object'] };
  }
  
  // Required fields
  if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
    errors.push('Node must have a non-empty string id');
  }
  
  if (!node.title || typeof node.title !== 'string' || node.title.trim() === '') {
    errors.push('Node must have a non-empty string title');
  }
  
  // Size is optional, but if provided must be valid
  if (node.size && typeof node.size === 'string') {
    const validSizes = ['half', 'regular', 'double'];
    if (!validSizes.includes(node.size)) {
      errors.push(`Node size must be one of: ${validSizes.join(', ')}`);
    }
  }
  
  if (typeof node.x !== 'number' || !Number.isFinite(node.x)) {
    errors.push('Node must have a valid number x coordinate');
  }
  
  if (typeof node.y !== 'number' || !Number.isFinite(node.y)) {
    errors.push('Node must have a valid number y coordinate');
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Validates if a given object is a valid rumor map edge
 * @param {any} edge - The object to validate
 * @param {string[]} nodeIds - Array of valid node IDs to check references
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
export function validateEdge(edge, nodeIds = []) {
  const errors = [];
  
  if (!edge || typeof edge !== 'object') {
    return { isValid: false, errors: ['Edge must be an object'] };
  }
  
  // Required fields
  if (!edge.source || typeof edge.source !== 'string' || edge.source.trim() === '') {
    errors.push('Edge must have a non-empty string source');
  } else if (nodeIds.length > 0 && !nodeIds.includes(edge.source)) {
    errors.push(`Edge source "${edge.source}" does not reference a valid node`);
  }
  
  if (!edge.target || typeof edge.target !== 'string' || edge.target.trim() === '') {
    errors.push('Edge must have a non-empty string target');
  } else if (nodeIds.length > 0 && !nodeIds.includes(edge.target)) {
    errors.push(`Edge target "${edge.target}" does not reference a valid node`);
  }
  
  // Direction is optional, but if provided must be valid
  if (edge.direction && typeof edge.direction === 'string') {
    const validDirections = ['forward', 'backward', 'bidirectional'];
    if (!validDirections.includes(edge.direction)) {
      errors.push(`Edge direction must be one of: ${validDirections.join(', ')}`);
    }
  }
  
  // Check for self-loops
  if (edge.source === edge.target) {
    errors.push('Edge cannot connect a node to itself (self-loop)');
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Validates if a given object is a valid rumor map
 * @param {any} map - The object to validate
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
export function validateRumorMap(map) {
  const errors = [];
  
  if (!map || typeof map !== 'object') {
    return { isValid: false, errors: ['Map must be an object'] };
  }
  
  // Check for required top-level properties
  if (!Array.isArray(map.nodes)) {
    errors.push('Map must have a nodes array');
    return { isValid: false, errors };
  }
  
  if (!Array.isArray(map.edges)) {
    errors.push('Map must have an edges array');
    return { isValid: false, errors };
  }
  
  // Validate nodes
  const nodeIds = new Set();
  map.nodes.forEach((node, index) => {
    const nodeValidation = validateNode(node);
    if (!nodeValidation.isValid) {
      errors.push(`Node at index ${index}: ${nodeValidation.errors.join(', ')}`);
    } else {
      // Check for duplicate IDs
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node ID "${node.id}" found`);
      } else {
        nodeIds.add(node.id);
      }
    }
  });
  
  // Convert to array for edge validation
  const nodeIdArray = Array.from(nodeIds);
  
  // Validate edges
  const edgeSet = new Set();
  map.edges.forEach((edge, index) => {
    const edgeValidation = validateEdge(edge, nodeIdArray);
    if (!edgeValidation.isValid) {
      errors.push(`Edge at index ${index}: ${edgeValidation.errors.join(', ')}`);
    } else {
      // Check for duplicate edges
      const edgeKey = `${edge.source}->${edge.target}`;
      if (edgeSet.has(edgeKey)) {
        errors.push(`Duplicate edge from "${edge.source}" to "${edge.target}" found`);
      } else {
        edgeSet.add(edgeKey);
      }
    }
  });
  
  // Additional map-level validations
  if (map.nodes.length === 0) {
    errors.push('Map must contain at least one node');
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Attempts to parse a JSON string and validate it as a rumor map
 * @param {string} jsonString - The JSON string to parse and validate
 * @returns {{isValid: boolean, errors: string[], data?: object}} Parse and validation result
 */
export function parseAndValidateRumorMap(jsonString) {
  let parsedData;
  
  try {
    parsedData = JSON.parse(jsonString);
  } catch (parseError) {
    return { 
      isValid: false, 
      errors: [`Invalid JSON: ${parseError.message}`] 
    };
  }
  
  const validation = validateRumorMap(parsedData);
  
  return {
    isValid: validation.isValid,
    errors: validation.errors,
    data: validation.isValid ? parsedData : undefined
  };
}

/**
 * Loads and validates a rumor map from a File object
 * @param {File} file - The file to load and validate
 * @returns {Promise<{isValid: boolean, errors: string[], data?: object}>} Promise resolving to validation result
 */
export function loadAndValidateRumorMapFromFile(file) {
  return new Promise((resolve) => {
    // Check file type
    if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
      resolve({
        isValid: false,
        errors: ['File must be a JSON file (.json extension or application/json MIME type)']
      });
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const content = event.target.result;
      const result = parseAndValidateRumorMap(content);
      resolve(result);
    };
    
    reader.onerror = () => {
      resolve({
        isValid: false,
        errors: ['Failed to read file']
      });
    };
    
    reader.readAsText(file);
  });
}
