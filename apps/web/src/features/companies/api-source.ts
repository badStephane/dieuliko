import { z } from "zod";
import type { Company } from "./company";
import type { CityCount, SectorCount } from "./filters";
import { assertPage, type CompanyPage, type CompanyRepository, type PageRequest } from "./repository";

/** Largest `limit` accepted by `GET /v1/companies`; bigger windows are fetched in chunks. */
export const API_MAX_PAGE_LIMIT = 100;
/**
 * Largest window one `search()` fetches (at most 20 parallel chunks). Covers the whole directory
 * (~1,900 companies); beyond it results are truncated rather than flooding the API.
 */
export const API_MAX_WINDOW = 2000;
/**
 * Default cache lifetime of API responses. A fetch revalidating sooner than its route lowers the
 * route's ISR interval, so this matches the daily refresh of company profiles.
 */
export const DEFAULT_REVALIDATE_SECONDS = 86400;

const apiCompanySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  sector: z.string().min(1),
  companyType: z.string().nullable(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().min(1),
  address: z.string().nullable(),
  size: z.enum(["startup", "pme", "grande_entreprise"]).nullable(),
  logoUrl: z.string().nullable(),
  socialLinks: z.record(z.string(), z.string()),
  acceptsSpontaneous: z.boolean().nullable(),
  verified: z.boolean(),
  rating: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().int().min(0),
}) satisfies z.ZodType<Company>;

const successEnvelopeSchema = z.object({ success: z.literal(true), data: z.unknown(), meta: z.unknown().optional() });
const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});
const pageMetaSchema = z.object({ total: z.number().int().min(0) });
const sectorCountSchema = z.object({ slug: z.string(), label: z.string(), count: z.number().int().min(0) });
const cityCountSchema = z.object({ city: z.string(), count: z.number().int().min(0) });

/** Failure reported by the Go API (`code` comes from its error envelope, or "invalid_response"). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Fetch = typeof fetch;

export interface ApiClientOptions {
  /** Shared secret exempting server-side calls from the API rate limit (never expose it to browsers). */
  readonly token?: string;
  /** Next.js data cache lifetime for every request (see DEFAULT_REVALIDATE_SECONDS). */
  readonly revalidateSeconds?: number;
  readonly fetchImpl?: Fetch;
}

interface ApiResponse {
  readonly data: unknown;
  readonly meta: unknown;
  readonly status: number;
}

/** GET helper returning the envelope's data, or `null` on 404. */
function createClient(
  baseUrl: string,
  { token, revalidateSeconds = DEFAULT_REVALIDATE_SECONDS, fetchImpl = fetch }: ApiClientOptions,
) {
  const root = baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json", ...(token ? { "X-Internal-Token": token } : {}) };

  return async function get(path: string, params: Record<string, string> = {}): Promise<ApiResponse | null> {
    const search = new URLSearchParams(params).toString();
    const url = `${root}/v1${path}${search ? `?${search}` : ""}`;
    const response = await fetchImpl(url, { headers, next: { revalidate: revalidateSeconds } });
    const body: unknown = await response.json().catch(() => null);

    if (response.status === 404) return null;
    if (!response.ok) {
      const failure = errorEnvelopeSchema.safeParse(body);
      const code = failure.success ? failure.data.error.code : "invalid_response";
      throw new ApiError(`GET ${url} failed with ${response.status} (${code})`, response.status, code);
    }

    const success = successEnvelopeSchema.safeParse(body);
    if (!success.success) throw new ApiError(`GET ${url} returned an invalid envelope`, response.status, "invalid_response");
    return { data: success.data.data, meta: success.data.meta, status: response.status };
  };
}

/** Validates `response.data` (or `meta` via `value`) against a schema. */
function parse<T>(schema: z.ZodType<T>, response: ApiResponse, what: string, value: unknown = response.data): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = `Invalid ${what} from API at ${issue?.path.join(".")}: ${issue?.message}`;
    throw new ApiError(message, response.status, "invalid_response");
  }
  return result.data;
}

/** Throws when a list endpoint answers 404 (it never should). */
function required(response: ApiResponse | null, path: string): ApiResponse {
  if (!response) throw new ApiError(`GET ${path} returned 404`, 404, "not_found");
  return response;
}

/**
 * Splits a result window into requests the API accepts (`limit` ≤ API_MAX_PAGE_LIMIT).
 * Windows are capped at API_MAX_WINDOW results.
 */
export function chunkPage({ offset, limit }: PageRequest): readonly PageRequest[] {
  const cappedLimit = Math.min(limit, API_MAX_WINDOW);
  const end = offset + cappedLimit;
  const starts = Array.from({ length: Math.ceil(cappedLimit / API_MAX_PAGE_LIMIT) }, (_, i) => offset + i * API_MAX_PAGE_LIMIT);
  return starts.map((start) => ({ offset: start, limit: Math.min(API_MAX_PAGE_LIMIT, end - start) }));
}

/** `CompanyRepository` backed by the Go API (`apps/api`). Every response is validated. */
export function createApiCompanyRepository(baseUrl: string, options: ApiClientOptions = {}): CompanyRepository {
  const get = createClient(baseUrl, options);

  async function fetchPage(params: Record<string, string>, page: PageRequest): Promise<CompanyPage> {
    const response = required(
      await get("/companies", { ...params, offset: String(page.offset), limit: String(page.limit) }),
      "/companies",
    );
    return {
      items: parse(z.array(apiCompanySchema), response, "companies"),
      total: parse(pageMetaSchema, response, "page meta", response.meta).total,
    };
  }

  return {
    async search(filters, page) {
      assertPage(page);
      const params = {
        ...(filters.query ? { q: filters.query } : {}),
        ...(filters.sector ? { sector: filters.sector } : {}),
        ...(filters.city ? { city: filters.city } : {}),
      };
      const pages = await Promise.all(chunkPage(page).map((chunk) => fetchPage(params, chunk)));
      return { items: pages.flatMap((p) => p.items), total: pages[0]?.total ?? 0 };
    },

    async findBySlug(slug) {
      const response = await get(`/companies/${encodeURIComponent(slug)}`);
      return response ? parse(apiCompanySchema, response, "company") : null;
    },

    async sectorCounts(): Promise<readonly SectorCount[]> {
      const counts = parse(z.array(sectorCountSchema), required(await get("/sectors"), "/sectors"), "sectors");
      // The API lists the whole taxonomy; the UI only shows sectors that have companies.
      return counts.filter((s) => s.count > 0).map((s) => ({ sector: s.slug, count: s.count }));
    },

    async cityCounts(): Promise<readonly CityCount[]> {
      return parse(z.array(cityCountSchema), required(await get("/cities"), "/cities"), "cities");
    },

    async allSlugs() {
      return parse(z.array(z.string()), required(await get("/company-slugs"), "/company-slugs"), "company slugs");
    },
  };
}
