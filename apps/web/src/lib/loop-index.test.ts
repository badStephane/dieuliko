import { describe, expect, it } from "vitest";
import { isOutsideWindow, toMiddleCopy } from "./loop-index";

describe("toMiddleCopy", () => {
  it("maps an index of any copy onto the same slide of the middle copy", () => {
    expect(toMiddleCopy(13, 4, 2)).toBe(9);
    expect(toMiddleCopy(7, 4, 2)).toBe(11);
  });

  it("handles negative indexes", () => {
    expect(toMiddleCopy(-1, 4, 2)).toBe(11);
  });

  it("returns 0 for an empty list", () => {
    expect(toMiddleCopy(5, 0, 2)).toBe(0);
  });
});

describe("isOutsideWindow", () => {
  it("flags slides before and after the visible window", () => {
    expect(isOutsideWindow(4, 5, 3)).toBe(true);
    expect(isOutsideWindow(5, 5, 3)).toBe(false);
    expect(isOutsideWindow(7, 5, 3)).toBe(false);
    expect(isOutsideWindow(8, 5, 3)).toBe(true);
  });
});
