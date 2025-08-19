// src/utils/rotation.js
import { printDebug } from '../utils/debug.js';

// Utility helpers for rotating node coordinates and orientation
// Rotation is around the origin (0,0). A 90° clockwise rotation maps (x, y) -> (-y, x)
// NOTE: My coordinate system has inverted Y (screen coords).

export function rotatePoint90Clockwise(x, y) {
  return { x: -y || 0, y: x || 0 };
}

export function rotateNodes90Clockwise(nodes) {
  return nodes.map(n => {
    if (typeof n.x !== 'number' || typeof n.y !== 'number') return n; // skip malformed
    const { x, y } = rotatePoint90Clockwise(n.x, n.y);
    return { ...n, x, y };
  });
}

export function incrementOrientationBy90(orientation) {
  return (orientation + 90) % 360;
}

// New helpers with logging (used by App + tests)
export function rotateCompassOnly(orientation) {
  const next = incrementOrientationBy90(orientation);
  printDebug('🧭 Rotating compass only (orientation +90)', { from: orientation, to: next });
  return next;
}

export function rotateNodesAndCompass(nodes, orientation) {
  printDebug('🌀 Rotating all nodes about origin + updating orientation', { fromOrientation: orientation });
  const rotatedNodes = rotateNodes90Clockwise(nodes);
  const nextOrientation = incrementOrientationBy90(orientation);
  return { nodes: rotatedNodes, orientation: nextOrientation };
}
