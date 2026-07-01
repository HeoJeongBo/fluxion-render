/**
 * Classify a thrown value as an origin storage-quota exhaustion, so callers can
 * distinguish "disk is full, evict and retry" from every other failure.
 *
 * Covers the standard `QuotaExceededError` DOMException plus legacy Firefox's
 * `NS_ERROR_DOM_QUOTA_REACHED`, and falls back to a plain-object `name` check
 * for environments that surface a non-DOMException error.
 *
 * @example
 * try {
 *   await store.writeVideoChunk(id, name, data);
 * } catch (e) {
 *   if (isQuotaExceededError(e)) await store.evictOldest();
 *   else throw e;
 * }
 */
export function isQuotaExceededError(e: unknown): boolean {
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED";
  }
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    ((e as { name?: unknown }).name === "QuotaExceededError" ||
      (e as { name?: unknown }).name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}
