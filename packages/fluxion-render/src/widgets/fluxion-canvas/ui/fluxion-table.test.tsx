import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FluxionTable, type FluxionTableColumn } from "./fluxion-table";

afterEach(cleanup);

type Row = { id: string; value: number; label: string };

const COLUMNS = [
  { key: "id" as const, header: "ID" },
  { key: "value" as const, header: "Value" },
  { key: "label" as const, header: "Label" },
];

const ROWS: Row[] = [
  { id: "a", value: 1.23, label: "alpha" },
  { id: "b", value: 4.56, label: "beta" },
];

describe("FluxionTable", () => {
  it("renders column headers", () => {
    render(<FluxionTable columns={COLUMNS} rows={[]} />);
    expect(screen.getByText("ID")).toBeTruthy();
    expect(screen.getByText("Value")).toBeTruthy();
    expect(screen.getByText("Label")).toBeTruthy();
  });

  it("renders one row per entry", () => {
    render(<FluxionTable columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.getByText("1.23")).toBeTruthy();
    expect(screen.getByText("4.56")).toBeTruthy();
  });

  it("renders empty tbody when rows is empty", () => {
    const { container } = render(<FluxionTable columns={COLUMNS} rows={[]} />);
    const tbody = container.querySelector("tbody");
    expect(tbody?.children.length).toBe(0);
  });

  it("applies classNames to all elements", () => {
    const { container } = render(
      <FluxionTable
        columns={COLUMNS}
        rows={ROWS}
        classNames={{
          root: "my-root",
          table: "my-table",
          thead: "my-thead",
          tbody: "my-tbody",
          tr: "my-tr",
          th: "my-th",
          td: "my-td",
        }}
      />,
    );
    expect(container.querySelector(".my-root")).toBeTruthy();
    expect(container.querySelector(".my-table")).toBeTruthy();
    expect(container.querySelector(".my-thead")).toBeTruthy();
    expect(container.querySelector(".my-tbody")).toBeTruthy();
    expect(container.querySelectorAll(".my-tr").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".my-th").length).toBe(COLUMNS.length);
    expect(container.querySelectorAll(".my-td").length).toBe(
      ROWS.length * COLUMNS.length,
    );
  });

  it("uses render function when provided", () => {
    const columns: FluxionTableColumn<Row>[] = [
      {
        key: "value",
        header: "Value",
        render: (v) => <span data-testid="custom">{(Number(v) * 2).toFixed(2)}</span>,
      },
    ];
    render(<FluxionTable columns={columns} rows={[{ id: "x", value: 3, label: "x" }]} />);
    expect(screen.getByTestId("custom").textContent).toBe("6.00");
  });

  it("falls back to String() for non-string cell values", () => {
    render(
      <FluxionTable
        columns={[{ key: "value" as const, header: "V" }]}
        rows={[{ id: "x", value: 0, label: "" }]}
      />,
    );
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("renders an empty string for a null/undefined cell value", () => {
    const { container } = render(
      <FluxionTable
        columns={[{ key: "label" as const, header: "L" }]}
        // label is null → `row[col.key] ?? ""` takes the empty-string branch.
        rows={[{ id: "x", value: 0, label: null as never }]}
      />,
    );
    const cell = container.querySelector("tbody td");
    expect(cell?.textContent).toBe("");
  });

  it("applies style prop to root wrapper", () => {
    const { container } = render(
      <FluxionTable columns={COLUMNS} rows={[]} style={{ color: "red" }} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.color).toBe("red");
  });

  it("renders correct number of th and td elements", () => {
    const { container } = render(<FluxionTable columns={COLUMNS} rows={ROWS} />);
    expect(container.querySelectorAll("th").length).toBe(COLUMNS.length);
    expect(container.querySelectorAll("td").length).toBe(ROWS.length * COLUMNS.length);
  });

  describe("sortable columns", () => {
    const sortCols: FluxionTableColumn<Row>[] = [
      { key: "id", header: "ID", sortable: true },
      { key: "value", header: "Value", sortable: true },
      { key: "label", header: "Label" }, // not sortable
    ];
    const unsorted: Row[] = [
      { id: "b", value: 30, label: "z" },
      { id: "a", value: 10, label: "y" },
      { id: "c", value: 20, label: "x" },
    ];

    function firstColumnValues(container: HTMLElement, colIndex: number): string[] {
      return Array.from(container.querySelectorAll("tbody tr")).map(
        (tr) => tr.children[colIndex]!.textContent ?? "",
      );
    }

    it("sorts numbers ascending then descending on header clicks", () => {
      const { container } = render(<FluxionTable columns={sortCols} rows={unsorted} />);
      const valueHeader = screen.getByText(/Value/);
      fireEvent.click(valueHeader);
      expect(firstColumnValues(container, 1)).toEqual(["10", "20", "30"]);
      fireEvent.click(valueHeader);
      expect(firstColumnValues(container, 1)).toEqual(["30", "20", "10"]);
    });

    it("sorts strings with locale compare", () => {
      const { container } = render(<FluxionTable columns={sortCols} rows={unsorted} />);
      fireEvent.click(screen.getByText(/ID/));
      expect(firstColumnValues(container, 0)).toEqual(["a", "b", "c"]);
    });

    it("ignores clicks on non-sortable headers", () => {
      const { container } = render(<FluxionTable columns={sortCols} rows={unsorted} />);
      fireEvent.click(screen.getByText("Label"));
      // order unchanged
      expect(firstColumnValues(container, 0)).toEqual(["b", "a", "c"]);
    });

    it("keeps equal values stable", () => {
      const rows: Row[] = [
        { id: "a", value: 5, label: "p" },
        { id: "b", value: 5, label: "q" },
      ];
      const { container } = render(<FluxionTable columns={sortCols} rows={rows} />);
      fireEvent.click(screen.getByText(/Value/));
      expect(firstColumnValues(container, 0)).toEqual(["a", "b"]);
    });

    it("falls back to unsorted when the active sort column disappears", () => {
      const { container, rerender } = render(
        <FluxionTable columns={sortCols} rows={unsorted} />,
      );
      fireEvent.click(screen.getByText(/Value/)); // sort by value
      expect(firstColumnValues(container, 0)).toEqual(["a", "c", "b"]);
      // Re-render without the "value" column → sort key no longer resolvable.
      const fewerCols: FluxionTableColumn<Row>[] = [
        { key: "id", header: "ID", sortable: true },
        { key: "label", header: "Label" },
      ];
      rerender(<FluxionTable columns={fewerCols} rows={unsorted} />);
      // Back to original row order (sort guard returns rows).
      expect(firstColumnValues(container, 0)).toEqual(["b", "a", "c"]);
    });
  });

  it("marks the header sticky when stickyHeader is set", () => {
    const { container } = render(
      <FluxionTable columns={COLUMNS} rows={ROWS} stickyHeader />,
    );
    const th = container.querySelector("th") as HTMLElement;
    expect(th.style.position).toBe("sticky");
  });
});
