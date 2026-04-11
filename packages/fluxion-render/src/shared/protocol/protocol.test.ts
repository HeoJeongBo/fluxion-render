import { describe, expect, it } from "vitest";
import { Op, type HostMsg } from "./protocol";

describe("Op", () => {
  it("exposes stable numeric opcodes", () => {
    expect(Op.INIT).toBe(1);
    expect(Op.RESIZE).toBe(2);
    expect(Op.ADD_LAYER).toBe(3);
    expect(Op.REMOVE_LAYER).toBe(4);
    expect(Op.CONFIG).toBe(5);
    expect(Op.DATA).toBe(6);
    expect(Op.DISPOSE).toBe(7);
  });

  it("is frozen-as-const (no duplicate codes)", () => {
    const codes = Object.values(Op);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("HostMsg discriminated union", () => {
  it("narrows by op field", () => {
    const msg: HostMsg = {
      op: Op.DATA,
      id: "x",
      buffer: new ArrayBuffer(8),
      dtype: "f32",
      length: 2,
    };
    if (msg.op === Op.DATA) {
      expect(msg.dtype).toBe("f32");
      expect(msg.length).toBe(2);
    } else {
      throw new Error("narrowing failed");
    }
  });
});
