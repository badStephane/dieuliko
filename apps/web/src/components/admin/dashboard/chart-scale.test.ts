import { describe, expect, it } from "vitest";
import { longDay, niceMax, peakIndex, shortDay, signedChange } from "./chart-scale";

describe("niceMax", () => {
  it("rounds the axis up to 1, 2 or 5 times a power of ten", () => {
    expect(niceMax([0, 3, 7])).toBe(10);
    expect(niceMax([12])).toBe(20);
    expect(niceMax([41, 5])).toBe(50);
    expect(niceMax([100])).toBe(100);
  });

  it("keeps an axis for empty or all-zero series", () => {
    expect(niceMax([])).toBe(1);
    expect(niceMax([0, 0])).toBe(1);
  });
});

describe("peakIndex", () => {
  it("points at the first largest value, or nothing when all are zero", () => {
    expect(peakIndex([1, 4, 4, 2])).toBe(1);
    expect(peakIndex([0, 0])).toBe(-1);
  });
});

describe("day labels", () => {
  it("format a Dakar date without shifting it", () => {
    expect(shortDay("2026-09-29")).toBe("29 sept.");
    expect(longDay("2026-09-29")).toBe("mardi 29 septembre");
  });
});

describe("signedChange", () => {
  it("signs the weekly change with a true minus sign", () => {
    expect(signedChange(5, 2)).toBe("+3");
    expect(signedChange(1, 3)).toBe("−2");
    expect(signedChange(2, 2)).toBe("0");
  });
});
