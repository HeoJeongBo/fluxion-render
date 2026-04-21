import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FluxionTable, type FluxionTableColumn } from "./fluxion-table";

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
    expect(container.querySelectorAll(".my-td").length).toBe(ROWS.length * COLUMNS.length);
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
    render(<FluxionTable columns={[{ key: "value" as const, header: "V" }]} rows={[{ id: "x", value: 0, label: "" }]} />);
    expect(screen.getByText("0")).toBeTruthy();
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
});
