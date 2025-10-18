// src/utils/notes.js
export function getNotesForTarget(graphData, id) {
  const raw = graphData?.notes?.[id];
  return Array.isArray(raw) ? raw : (raw ? [raw] : []);
}

export function hasContent(graphData, id) {
  return getNotesForTarget(graphData, id)
    .join('\n\n')
    .trim()
    .length > 0;
}
