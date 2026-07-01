import { describe, expect, it } from "vitest";
import { isQuotaExceededError } from "./is-quota-exceeded-error";

describe("isQuotaExceededError", () => {
  it("returns true for a QuotaExceededError DOMException", () => {
    expect(isQuotaExceededError(new DOMException("full", "QuotaExceededError"))).toBe(
      true,
    );
  });

  it("returns true for the legacy NS_ERROR_DOM_QUOTA_REACHED DOMException", () => {
    expect(
      isQuotaExceededError(new DOMException("full", "NS_ERROR_DOM_QUOTA_REACHED")),
    ).toBe(true);
  });

  it("returns false for a non-quota DOMException", () => {
    expect(isQuotaExceededError(new DOMException("missing", "NotFoundError"))).toBe(
      false,
    );
  });

  it("returns true for a plain object whose name is QuotaExceededError", () => {
    expect(isQuotaExceededError({ name: "QuotaExceededError" })).toBe(true);
  });

  it("returns true for a plain object with the legacy quota name", () => {
    expect(isQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
  });

  it("returns false for a plain object with a different name", () => {
    expect(isQuotaExceededError({ name: "TypeError" })).toBe(false);
  });

  it("returns false for null, undefined, primitives, and generic errors", () => {
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError(undefined)).toBe(false);
    expect(isQuotaExceededError("QuotaExceededError")).toBe(false);
    expect(isQuotaExceededError(42)).toBe(false);
    // A generic Error whose *message* mentions quota is NOT a quota error.
    expect(isQuotaExceededError(new Error("QuotaExceededError"))).toBe(false);
  });
});
