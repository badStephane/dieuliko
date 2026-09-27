import { describe, expect, it } from "vitest";
import { formatNumber } from "./format";

describe("formatNumber", () => {
  it("uses a no-break space as thousands separator and a comma for decimals", () => {
    expect(formatNumber(1904)).toBe("1 904");
    expect(formatNumber(4.62)).toBe("4,6");
  });
});
