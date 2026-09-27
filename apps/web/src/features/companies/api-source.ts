import { z } from "zod";
import { createApiClient, parseApiData, requireResponse, type ApiClient, type ApiClientOptions } from "@/lib/api-client";
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

const pageMetaSchema = z.object({ total: z.number().int().min(0) });
const sectorCountSchema = z.object({ slug: z.string(), label: z.string(), count: z.number().int().min(0) });
const cityCountSchema = z.object({ city: z.string(), count: z.number().int().min(0) });

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

async function fetchPage(client: ApiClient, params: Record<string, string>, page: PageRequest): Promise<CompanyPage> {
  const response = requireResponse(
    await client.get("/companies", { params: { ...params, offset: String(page.offset), limit: String(page.limit) } }),
    "/companies",
  );
  return {
    items: parseApiData(z.array(apiCompanySchema), response, "companies"),
    total: parseApiData(pageMetaSchema, response, "page meta", response.meta).total,
  };
}

/** `CompanyRepository` backed by the Go API (`apps/api`). Every response is validated. */
export function createApiCompanyRepository(baseUrl: string, options: ApiClientOptions = {}): CompanyRepository {
  const client = createApiClient(baseUrl, options);

  return {
    async search(filters, page) {
      assertPage(page);
      const params = {
        ...(filters.query ? { q: filters.query } : {}),
        ...(filters.sector ? { sector: filters.sector } : {}),
        ...(filters.city ? { city: filters.city } : {}),
      };
      const pages = await Promise.all(chunkPage(page).map((chunk) => fetchPage(client, params, chunk)));
      return { items: pages.flatMap((p) => p.items), total: pages[0]?.total ?? 0 };
    },

    async findBySlug(slug) {
      const response = await client.get(`/companies/${encodeURIComponent(slug)}`);
      return response ? parseApiData(apiCompanySchema, response, "company") : null;
    },

    async sectorCounts(): Promise<readonly SectorCount[]> {
      const counts = parseApiData(z.array(sectorCountSchema), requireResponse(await client.get("/sectors"), "/sectors"), "sectors");
      // The API lists the whole taxonomy; the UI only shows sectors that have companies.
      return counts.filter((s) => s.count > 0).map((s) => ({ sector: s.slug, count: s.count }));
    },

    async cityCounts(): Promise<readonly CityCount[]> {
      return parseApiData(z.array(cityCountSchema), requireResponse(await client.get("/cities"), "/cities"), "cities");
    },

    async allSlugs() {
      return parseApiData(z.array(z.string()), requireResponse(await client.get("/company-slugs"), "/company-slugs"), "company slugs");
    },
  };
}
