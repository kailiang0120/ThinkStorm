/**
 * Shared text helpers. Kept dependency-free so both the canvas and the
 * report can use the same filename/label rules.
 */

/** Filesystem-safe slug. Strips everything that Windows/macOS reject in a filename. */
export function slugify(value, fallback = "web", maxLength = 48) {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** Truncate with an ellipsis only when the text is actually longer than the limit. */
export function truncate(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}
