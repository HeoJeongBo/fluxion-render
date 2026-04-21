import type { CSSProperties, ReactNode } from "react";

export interface FluxionTableColumn<R extends Record<string, unknown>> {
  key: keyof R & string;
  header: string;
  render?: (value: R[keyof R & string], row: R) => ReactNode;
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
  td: {
    padding: "10px 16px",
    textAlign: "center" as const,
    color: "#334155",
    whiteSpace: "nowrap" as const,
    verticalAlign: "middle" as const,
    borderBottom: "none",
  },
  trEven: { background: "#ffffff" },
  trOdd:  { background: "#ffffff" },
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
}: FluxionTableProps<R>) {
  return (
    <div className={classNames.root} style={classNames.root ? style : { ...S.root, ...style }}>
      <table className={classNames.table} style={classNames.table ? undefined : S.table}>
        <thead className={classNames.thead}>
          <tr className={classNames.tr}>
            {columns.map((col) => (
              <th key={col.key} className={classNames.th} style={classNames.th ? undefined : S.th}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={classNames.tbody}>
          {rows.map((row, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr
              key={i}
              className={classNames.tr}
              style={classNames.tr ? undefined : i % 2 === 0 ? S.trEven : S.trOdd}
            >
              {columns.map((col) => (
                <td key={col.key} className={classNames.td} style={classNames.td ? undefined : S.td}>
                  {col.render
                    ? col.render(row[col.key], row)
                    : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
