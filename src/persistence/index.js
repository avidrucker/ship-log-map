// src/persistence/index.js
import { deserializeGraph, serializeGraph } from "../graph/ops.js";

const STORAGE_KEY = "ship_log_map_v1";
const SCHEMA_VERSION = 1;

export function newBlankMap() {
  return { nodes: [], edges: [], notes: {}, __version: SCHEMA_VERSION };
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

export function loadFromLocal(key = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Version gate if we ever need migrations
    if (typeof parsed.__version !== "number") parsed.__version = 1;
    return deserializeGraph(parsed);
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
        resolve(deserializeGraph(parsed));
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsText(file);
  });
}
