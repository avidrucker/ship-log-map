// src/persistence/index.js
import { deserializeGraph, serializeGraph } from "../graph/ops.js";

const STORAGE_KEY = "ship_log_map_v1";
const MODE_STORAGE_KEY = "ship_log_map_mode_v1";
const SCHEMA_VERSION = 1;

export function newBlankMap() {
  return { nodes: [], edges: [], notes: {}, mode: 'editing', __version: SCHEMA_VERSION };
}

export function saveToLocal(graph, key = STORAGE_KEY) {
  try {
    const g = deserializeGraph(graph);
    const payload = { ...g, __version: SCHEMA_VERSION };
    localStorage.setItem(key, serializeGraph(payload));
    return true;
  } catch (e) {
    console.error("saveToLocal failed:", e);
    return false;
  }
}

export function saveModeToLocal(mode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
    return true;
  } catch (e) {
    console.error("saveModeToLocal failed:", e);
    return false;
  }
}

export function loadModeFromLocal() {
  try {
    const mode = localStorage.getItem(MODE_STORAGE_KEY);
    return mode || 'editing'; // default to editing mode
  } catch (e) {
    console.error("loadModeFromLocal failed:", e);
    return 'editing';
  }
}

export function loadFromLocal(key = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Version gate if we ever need migrations
    if (typeof parsed.__version !== "number") parsed.__version = 1;
    const graph = deserializeGraph(parsed);
    
    // Include mode if present in the saved data, otherwise default to editing
    if (parsed.mode) {
      graph.mode = parsed.mode;
    }
    
    return graph;
  } catch (e) {
    console.error("loadFromLocal failed:", e);
    return null;
  }
}

// For <input type="file"> (browser)
export function loadFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (err) => reject(err);
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const graph = deserializeGraph(parsed);
        
        // Include mode if present in the imported data, otherwise default to editing
        if (parsed.mode) {
          graph.mode = parsed.mode;
        }
        
        resolve(graph);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsText(file);
  });
}
