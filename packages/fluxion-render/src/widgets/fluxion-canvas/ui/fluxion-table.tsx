import { type CSSProperties, type ReactNode, useMemo, useState } from "react";

/** Compute the visible row window [start, end) for virtual scrolling. */
function virtualWindow(
  scrollTop: number,
  rowHeight: number,
  viewportHeight: number,
  total: number,
  overscan: number,
): { start: number; end: number } {
  const first = Math.floor(scrollTop / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + visible + overscan);
  return { start, end };
}

export interface FluxionTableColumn<R extends Record<string, unknown>> {
  key: keyof R & string;
  header: string;
  render?: (value: R[keyof R & string], row: R) => ReactNode;
  /** Allow clicking this column's header to sort rows by its value. Default false. */
  sortable?: boolean;
}

export interface FluxionTableClassNames {
  root?: string;
  table?: string;
  thead?: string;
  tbody?: string;
  tr?: string;
  th?: string;
  td?: string;
}

export interface FluxionTableProps<R extends Record<string, unknown>> {
  columns: FluxionTableColumn<R>[];
  rows: R[];
  classNames?: FluxionTableClassNames;
  style?: CSSProperties;
  /**
   * Keep the header row pinned while the body scrolls vertically. Pair with a
   * fixed `maxHeight` (via `style`) so the body has somewhere to scroll. Default
   * false.
   */
  stickyHeader?: boolean;
  /**
   * Virtualize rows: only the visible window (plus overscan) is rendered, so
   * thousands of rows stay smooth. Requires a fixed `rowHeight` and viewport
   * `height` in px. Implies a scroll container; pair with `stickyHeader` to keep
   * the header visible. Omit for the default (render-all) behavior.
   */
  virtual?: { rowHeight: number; height: number; overscan?: number };
}

const S = {
  root: {
    width: "100%",
    overflowX: "auto" as const,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    fontFamily: "inherit",
    background: "#ffffff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    tableLayout: "fixed" as const,
  },
  th: {
    padding: "12px 16px",
    textAlign: "center" as const,
    fontWeight: 600,
    fontSize: 13,
    color: "#1e293b",
    background: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap" as const,
  },
  thSticky: {
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
  },
  thSortable: {
    cursor: "pointer" as const,
    userSelect: "none" as const,
  },
  td: {
    padding: "10px 16px",
    textAlign: "center" as const,
    color: "#334155",
    whiteSpace: "nowrap" as const,
    verticalAlign: "middle" as const,
    borderBottom: "none",
  },
  trEven: { background: "#ffffff" },
  trOdd: { background: "#ffffff" },
};

/**
 * Thin table renderer for high-frequency streaming data. Pair with
 * `useFluxionTable` which throttles React state updates to a low frequency
 * (e.g. 1 Hz) even when the data pump runs at 120 Hz.
 *
 * Ships with sensible default styles (TanStack Table–like). Override any
 * element via `classNames` — a className always takes precedence over the
 * built-in inline styles for that element.
 */
export function FluxionTable<R extends Record<string, unknown>>({
  columns,
  rows,
  classNames = {},
  style,
  stickyHeader = false,
  virtual,
}: FluxionTableProps<R>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortable) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sort.key as keyof R];
      const bv = b[sort.key as keyof R];
      if (av === bv) return 0;
      // Numbers compare numerically; everything else by locale string.
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * sort.dir;
      }
      return String(av).localeCompare(String(bv)) * sort.dir;
    });
  }, [rows, columns, sort]);

  const onHeaderClick = (col: FluxionTableColumn<R>) => {
    if (!col.sortable) return;
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === 1 ? -1 : 1 }
        : { key: col.key, dir: 1 },
    );
  };

  // Virtual scrolling: render only the visible slice + overscan, with spacer
  // rows above and below to preserve total scroll height.
  const win = virtual
    ? virtualWindow(
        scrollTop,
        virtual.rowHeight,
        virtual.height,
        sortedRows.length,
        virtual.overscan ?? 4,
      )
    : { start: 0, end: sortedRows.length };
  const visibleRows = virtual ? sortedRows.slice(win.start, win.end) : sortedRows;
  const padTop = virtual ? win.start * virtual.rowHeight : 0;
  const padBottom = virtual ? (sortedRows.length - win.end) * virtual.rowHeight : 0;

  const rootStyle: CSSProperties = classNames.root
    ? { ...(virtual ? { height: virtual.height, overflowY: "auto" } : null), ...style }
    : {
        ...S.root,
        ...(virtual ? { height: virtual.height, overflowY: "auto" } : null),
        ...style,
      };

  return (
    <div
      className={classNames.root}
      style={rootStyle}
      onScroll={
        virtual ? (e) => setScrollTop((e.target as HTMLDivElement).scrollTop) : undefined
      }
    >
      <table className={classNames.table} style={classNames.table ? undefined : S.table}>
        <thead className={classNames.thead}>
          <tr className={classNames.tr}>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const arrow = col.sortable
                ? active
                  ? sort!.dir === 1
                    ? " ▲"
                    : " ▼"
                  : " ⇅"
                : "";
              const thStyle = classNames.th
                ? undefined
                : {
                    ...S.th,
                    ...(stickyHeader ? S.thSticky : null),
                    ...(col.sortable ? S.thSortable : null),
                  };
              return (
                <th
                  key={col.key}
                  className={classNames.th}
                  style={thStyle}
                  onClick={() => onHeaderClick(col)}
                >
                  {col.header}
                  {arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={classNames.tbody}>
          {padTop > 0 && (
            <tr aria-hidden style={{ height: padTop }}>
              <td colSpan={columns.length} style={{ padding: 0, border: "none" }} />
            </tr>
          )}
          {visibleRows.map((row, vi) => {
            const i = win.start + vi; // absolute row index (striping/key)
            return (
              // eslint-disable-next-line react/no-array-index-key
              <tr
                key={i}
                className={classNames.tr}
                style={classNames.tr ? undefined : i % 2 === 0 ? S.trEven : S.trOdd}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={classNames.td}
                    style={classNames.td ? undefined : S.td}
                  >
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
          {padBottom > 0 && (
            <tr aria-hidden style={{ height: padBottom }}>
              <td colSpan={columns.length} style={{ padding: 0, border: "none" }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
