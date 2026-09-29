import { describe, expect, it } from "vitest";
import { companyLogoUrl, isLogoSlug, LOGO_FORMAT, LOGO_MISSING, LOGO_TOO_LARGE, logoFileError, logoResponse, MAX_LOGO_BYTES } from "./logo";

describe("companyLogoUrl", () => {
  it("points at the site's logo route, versioned so a new upload changes the URL", () => {
    expect(companyLogoUrl("cabinet-ndiaye", "0b0b.png")).toBe("/logos/cabinet-ndiaye?v=0b0b.png");
  });

  it("encodes the slug and the version", () => {
    expect(companyLogoUrl("a b", "x&y")).toBe("/logos/a%20b?v=x%26y");
  });
});

describe("isLogoSlug", () => {
  it("accepts directory slugs only", () => {
    expect(isLogoSlug("cabinet-ndiaye-2")).toBe(true);
    expect(isLogoSlug("../secret")).toBe(false);
    expect(isLogoSlug("")).toBe(false);
    expect(isLogoSlug("a".repeat(121))).toBe(false);
  });
});

describe("logoResponse", () => {
  const upstream = (type: string, cache = "public, max-age=31536000, immutable") =>
    new Response("bytes", { headers: { "Content-Type": type, "Cache-Control": cache } });

  it("relays an image with its type and the API's cache policy when public", async () => {
    const response = logoResponse(upstream("image/png"), "public");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("bytes");
  });

  it("never lets a private logo be cached", () => {
    expect(logoResponse(upstream("image/webp"), "private").headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("refuses anything that is not an accepted image type", () => {
    expect(logoResponse(upstream("image/svg+xml"), "public").status).toBe(502);
    expect(logoResponse(upstream("text/html"), "public").status).toBe(502);
  });

  it("answers 404 without an upstream file", () => {
    expect(logoResponse(null, "public").status).toBe(404);
  });
});

describe("logoFileError", () => {
  const file = (size: number, type: string) => new File([new Uint8Array(size)], "logo", { type });

  it("accepts a PNG, JPEG or WebP image up to 2 MB", () => {
    expect(logoFileError(file(10, "image/png"))).toBeNull();
    expect(logoFileError(file(MAX_LOGO_BYTES, "image/webp"))).toBeNull();
  });

  it("explains what is wrong otherwise", () => {
    expect(logoFileError(null)).toBe(LOGO_MISSING);
    expect(logoFileError(file(0, "image/png"))).toBe(LOGO_MISSING);
    expect(logoFileError(file(MAX_LOGO_BYTES + 1, "image/png"))).toBe(LOGO_TOO_LARGE);
    expect(logoFileError(file(10, "image/svg+xml"))).toBe(LOGO_FORMAT);
  });
});
