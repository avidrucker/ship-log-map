// Robust, Unicode-friendly hashtag parsing utils
// - Normalizes to lowercase
// - Accepts letters/numbers/underscore/hyphen in tags

const HASHTAG_RE = /(^|[\s.,;:!?"'(){}\[\]])#([\p{L}\p{N}_-]{1,64})/giu;

export function normalizeTag(tag) {
  return tag.replace(/^#/, '').toLowerCase();
}

export function extractHashtagsFromText(text) {
  if (!text) return [];
  const seen = new Set();
  let m;
  while ((m = HASHTAG_RE.exec(text)) !== null) {
    const tag = normalizeTag(m[2]);
    if (tag) seen.add(tag);
  }
  return [...seen];
}

// Split a user query into tokens (words) — lowercase, unique
export function tokenizeQuery(input) {
  if (!input) return [];
  const raw = input
    .toLowerCase()
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  return [...new Set(raw)];
}
