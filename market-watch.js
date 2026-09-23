export function marketWatchIds(value, validIdsSet) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const id of value.slice(0, 50)) {
    if (out.length >= 50) break;
    if (typeof id !== 'string' || id.length > 64) continue;
    if (!validIdsSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}