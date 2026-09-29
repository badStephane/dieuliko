/** Company logos uploaded in the back-office, served by this site (the browser never talks to the API). */
export const LOGOS_PATH = "/logos";

/** Image types the API accepts for a logo; anything else coming back is refused. */
export const LOGO_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];
/** Mirrors logo.MaxBytes of the API. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const LOGO_MISSING = "Choisissez une image.";
export const LOGO_TOO_LARGE = "Le logo ne doit pas dépasser 2 Mo.";
export const LOGO_FORMAT = "Le logo doit être une image PNG, JPEG ou WebP.";

/** Early checks on what the browser says about a file (the API checks its actual content); null when it may be sent. */
export function logoFileError(file: unknown): string | null {
  if (!(file instanceof File) || file.size === 0) return LOGO_MISSING;
  if (file.size > MAX_LOGO_BYTES) return LOGO_TOO_LARGE;
  if (!LOGO_TYPES.includes(file.type)) return LOGO_FORMAT;
  return null;
}

const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;
const PRIVATE_CACHE = "private, no-store";
const FALLBACK_PUBLIC_CACHE = "public, max-age=300";

export function isLogoSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** URL of a listing's logo; the version changes with every upload, so the URL can be cached for good. */
export function companyLogoUrl(slug: string, version: string): string {
  return `${LOGOS_PATH}/${encodeURIComponent(slug)}?v=${encodeURIComponent(version)}`;
}

function empty(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": PRIVATE_CACHE } });
}

/**
 * Relays a logo fetched from the API. Public logos keep the API's cache policy; the back-office's are never stored
 * (a hidden listing's logo must not linger in shared caches). Only accepted image types go through.
 */
export function logoResponse(upstream: Response | null, visibility: "public" | "private"): Response {
  if (!upstream?.body) return empty(404);
  const type = upstream.headers.get("Content-Type") ?? "";
  if (!LOGO_TYPES.includes(type)) return empty(502);
  const cache = visibility === "private" ? PRIVATE_CACHE : (upstream.headers.get("Cache-Control") ?? FALLBACK_PUBLIC_CACHE);
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
