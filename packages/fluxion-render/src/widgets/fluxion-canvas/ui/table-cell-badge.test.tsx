import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type BadgeTone, TableCellBadge } from "./table-cell-badge";

afterEach(cleanup);

describe("TableCellBadge", () => {
  it("renders its children", () => {
    const { getByText } = render(<TableCellBadge>OK</TableCellBadge>);
    expect(getByText("OK")).toBeTruthy();
  });

  it("applies each tone without throwing", () => {
    const tones: BadgeTone[] = ["neutral", "info", "success", "warning", "error"];
    for (const tone of tones) {
      const { getByText } = render(<TableCellBadge tone={tone}>{tone}</TableCellBadge>);
      expect(getByText(tone)).toBeTruthy();
      cleanup();
    }
  });

  it("lets background/color overrides take precedence", () => {
    const { getByText } = render(
      <TableCellBadge background="#000" color="#fff">
        x
      </TableCellBadge>,
    );
    const span = getByText("x") as HTMLElement;
    expect(span.style.background).toBe("#000");
    expect(span.style.color).toBe("#fff");
  });

  it("uses square corners when pill=false", () => {
    const { getByText } = render(<TableCellBadge pill={false}>y</TableCellBadge>);
    const span = getByText("y") as HTMLElement;
    expect(span.style.borderRadius).toBe("4px");
  });

  it("defers to className when provided (no inline base styles)", () => {
    const { getByText } = render(
      <TableCellBadge className="my-badge" style={{ margin: 2 }}>
        z
      </TableCellBadge>,
    );
    const span = getByText("z") as HTMLElement;
    expect(span.className).toBe("my-badge");
    expect(span.style.margin).toBe("2px");
    expect(span.style.background).toBe("");
  });
});
