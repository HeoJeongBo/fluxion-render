/**
 * Small, dependency-free formatters for replay UIs — elapsed time and byte
 * sizes. Pure functions (no React), so they're exported from the package root
 * rather than the `/react` entry.
 */

/**
 * Format a millisecond duration as `mm:ss` (zero-padded, clamped at 0).
 *
 * @example
 * formatMs(0)      // "00:00"
 * formatMs(65_000) // "01:05"
 * formatMs(-500)   // "00:00"  (negatives clamp to zero)
 */
export function formatMs(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Format a byte count as a human-readable `KB`/`MB`/`GB` string.
 *
 * @example
 * formatBytes(2048)            // "2.0 KB"
 * formatBytes(5 * 1024 * 1024) // "5.0 MB"
 * formatBytes(3 * 1024 ** 3)   // "3.00 GB"
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
