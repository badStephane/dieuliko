import { describe, expect, it } from "vitest";
import { formatDate, formatFileSize, formatNumber } from "./format";

describe("formatNumber", () => {
  it("uses a no-break space as thousands separator and a comma for decimals", () => {
    expect(formatNumber(1904)).toBe("1 904");
    expect(formatNumber(4.62)).toBe("4,6");
  });
});

describe("formatFileSize", () => {
  it("uses kilo-octets under a mega-octet, mega-octets above", () => {
    expect(formatFileSize(125)).toBe("1 Ko");
    expect(formatFileSize(250 * 1024)).toBe("250 Ko");
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe("1,3 Mo");
  });
});

describe("formatDate", () => {
  it("writes the day, month and year in French", () => {
    expect(formatDate("2026-09-28T07:49:17Z")).toBe("28 septembre 2026");
  });
});
