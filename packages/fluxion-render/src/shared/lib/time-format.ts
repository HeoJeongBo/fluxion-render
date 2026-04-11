/**
 * Tiny clock pattern formatter. Supports the following tokens (leftmost
 * longest wins):
 *
 *   HH  - hours, zero-padded (00..23)
 *   H   - hours (0..23)
 *   mm  - minutes, zero-padded (00..59)
 *   m   - minutes (0..59)
 *   ss  - seconds, zero-padded (00..59)
 *   s   - seconds (0..59)
 *   SSS - milliseconds, zero-padded (000..999)
 *   S   - tenths of a second (0..9)
 *
 * Anything else is treated as a literal (e.g. ":", ".", " ", "T"). The parser
 * is intentionally small: no locale support, no escape syntax. Feed it a
 * wall-clock epoch in ms.
 *
 * Example:
 *   formatClock(Date.now(), "HH:mm:ss")       -> "14:07:32"
 *   formatClock(Date.now(), "HH:mm:ss.SSS")   -> "14:07:32.481"
 *   formatClock(Date.now(), "H:m:s")          -> "14:7:32"
 */
const TOKEN_RE = /HH|SSS|mm|ss|H|m|s|S/g;

export type TickFormatter = (epochMs: number) => string;

/** Build a memoized formatter for a pattern. */
export function makeClockFormatter(pattern: string): TickFormatter {
  return (epochMs: number) => formatClock(epochMs, pattern);
}

export function formatClock(epochMs: number, pattern: string): string {
  const d = new Date(epochMs);
  return pattern.replace(TOKEN_RE, (tok) => {
    switch (tok) {
      case "HH":
        return String(d.getHours()).padStart(2, "0");
      case "H":
        return String(d.getHours());
      case "mm":
        return String(d.getMinutes()).padStart(2, "0");
      case "m":
        return String(d.getMinutes());
      case "ss":
        return String(d.getSeconds()).padStart(2, "0");
      case "s":
        return String(d.getSeconds());
      case "SSS":
        return String(d.getMilliseconds()).padStart(3, "0");
      case "S":
        return String(Math.floor(d.getMilliseconds() / 100));
      default:
        return tok;
    }
  });
}
