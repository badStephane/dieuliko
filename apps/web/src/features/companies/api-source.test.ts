import { describe, expect, it, vi } from "vitest";
import { ApiError, DEFAULT_REVALIDATE_SECONDS } from "@/lib/api-client";
import { API_MAX_PAGE_LIMIT, API_MAX_WINDOW, chunkPage, createApiCompanyRepository } from "./api-source";
import type { Company } from "./company";

const BASE_URL = "http://api.test/";

function apiCompany(overrides: Partial<Company> = {}): Company {
  return {
    slug: "and-vision-agency",
    name: "And Vision Agency",
    sector: "informatique",
    companyType: "agence digitale / ESN",
    description: null,
    website: null,
    email: null,
    phone: "+221 77 751 55 63",
    city: "Dakar",
    address: null,
    size: "pme",
    logoUrl: null,
    socialLinks: {},
    acceptsSpontaneous: null,
    verified: false,
    rating: 5,
    ratingCount: 41,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fetch double answering each call from `handler`, recording requested URLs. */
function fakeFetch(handler: (url: URL) => Response) {
  const urls: URL[] = [];
  const inits: RequestInit[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    urls.push(url);
    inits.push(init ?? {});
    return handler(url);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, urls, inits };
}

describe("chunkPage", () => {
  it("keeps windows the API accepts as a single request", () => {
    expect(chunkPage({ offset: 24, limit: 12 })).toEqual([{ offset: 24, limit: 12 }]);
  });

  it("splits larger windows into API-sized chunks", () => {
    expect(chunkPage({ offset: 0, limit: 250 })).toEqual([
      { offset: 0, limit: API_MAX_PAGE_LIMIT },
      { offset: 100, limit: API_MAX_PAGE_LIMIT },
      { offset: 200, limit: 50 },
    ]);
  });

  it("caps the window so one search never floods the API", () => {
    const chunks = chunkPage({ offset: 0, limit: 12000 });

    expect(chunks).toHaveLength(API_MAX_WINDOW / API_MAX_PAGE_LIMIT);
    expect(chunks.at(-1)).toEqual({ offset: API_MAX_WINDOW - API_MAX_PAGE_LIMIT, limit: API_MAX_PAGE_LIMIT });
  });
});

describe("createApiCompanyRepository", () => {
  it("serves an uploaded logo from this site, before any external logo", async () => {
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse(200, { success: true, data: { ...apiCompany({ logoUrl: "https://ext.test/logo.png" }), logoVersion: "0b0b.png" } }),
    );

    const company = await createApiCompanyRepository(BASE_URL, { fetchImpl }).findBySlug("and-vision-agency");

    expect(company?.logoUrl).toBe("/logos/and-vision-agency?v=0b0b.png");
    expect(company).not.toHaveProperty("logoVersion");
  });

  it("keeps the external logo when none was uploaded", async () => {
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse(200, { success: true, data: { ...apiCompany({ logoUrl: "https://ext.test/logo.png" }), logoVersion: null } }),
    );

    const company = await createApiCompanyRepository(BASE_URL, { fetchImpl }).findBySlug("and-vision-agency");

    expect(company?.logoUrl).toBe("https://ext.test/logo.png");
  });

  it("caches responses for the configured lifetime (daily by default)", async () => {
    const ok = () => jsonResponse(200, { success: true, data: [] });
    const byDefault = fakeFetch(ok);
    const custom = fakeFetch(ok);

    await createApiCompanyRepository(BASE_URL, { fetchImpl: byDefault.fetchImpl }).allSlugs();
    await createApiCompanyRepository(BASE_URL, { revalidateSeconds: 60, fetchImpl: custom.fetchImpl }).allSlugs();

    expect(byDefault.inits[0]).toMatchObject({ next: { revalidate: DEFAULT_REVALIDATE_SECONDS } });
    expect(custom.inits[0]).toMatchObject({ next: { revalidate: 60 } });
  });

  it("treats a 404 on a list endpoint as an error", async () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse(404, { success: false, data: null, error: { code: "not_found", message: "x" } }));

    await expect(createApiCompanyRepository(BASE_URL, { fetchImpl }).sectorCounts()).rejects.toMatchObject({ code: "not_found" });
  });

  it("searches with filters and returns items with the total", async () => {
    const { fetchImpl, urls } = fakeFetch(() =>
      jsonResponse(200, { success: true, data: [apiCompany()], error: null, meta: { total: 31, offset: 0, limit: 12 } }),
    );
    const repository = createApiCompanyRepository(BASE_URL, { fetchImpl });

    const page = await repository.search({ query: "hôtel", sector: "sante", city: "Thiès" }, { offset: 0, limit: 12 });

    expect(page.total).toBe(31);
    expect(page.items.map((c) => c.slug)).toEqual(["and-vision-agency"]);
    expect(urls[0]?.pathname).toBe("/v1/companies");
    expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toEqual({
      q: "hôtel",
      sector: "sante",
      city: "Thiès",
      offset: "0",
      limit: "12",
    });
  });

  it("sends the internal token only when one is configured", async () => {
    const ok = () => jsonResponse(200, { success: true, data: [] });
    const withToken = fakeFetch(ok);
    const without = fakeFetch(ok);

    await createApiCompanyRepository(BASE_URL, { token: "s3cret", fetchImpl: withToken.fetchImpl }).allSlugs();
    await createApiCompanyRepository(BASE_URL, { fetchImpl: without.fetchImpl }).allSlugs();

    expect(withToken.inits[0]?.headers).toMatchObject({ "X-Internal-Token": "s3cret" });
    expect(without.inits[0]?.headers).not.toHaveProperty("X-Internal-Token");
  });

  it("omits empty filters", async () => {
    const { fetchImpl, urls } = fakeFetch(() => jsonResponse(200, { success: true, data: [], meta: { total: 0 } }));

    await createApiCompanyRepository(BASE_URL, { fetchImpl }).search({}, { offset: 0, limit: 12 });

    expect([...(urls[0]?.searchParams.keys() ?? [])]).toEqual(["offset", "limit"]);
  });

  it("fetches windows larger than the API limit in parallel chunks and concatenates them", async () => {
    const { fetchImpl, urls } = fakeFetch((url) => {
      const offset = Number(url.searchParams.get("offset"));
      return jsonResponse(200, { success: true, data: [apiCompany({ slug: `c-${offset}` })], meta: { total: 150 } });
    });

    const page = await createApiCompanyRepository(BASE_URL, { fetchImpl }).search({}, { offset: 0, limit: 150 });

    expect(urls.map((u) => u.searchParams.get("limit"))).toEqual(["100", "50"]);
    expect(page.items.map((c) => c.slug)).toEqual(["c-0", "c-100"]);
    expect(page.total).toBe(150);
  });

  it("rejects invalid page requests before calling the API", async () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse(200, {}));
    const repository = createApiCompanyRepository(BASE_URL, { fetchImpl });

    await expect(repository.search({}, { offset: -1, limit: 12 })).rejects.toThrow(/offset/);
    await expect(repository.search({}, { offset: 0, limit: 0 })).rejects.toThrow(/limit/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("finds a company by slug and returns null on 404", async () => {
    const { fetchImpl, urls } = fakeFetch((url) =>
      url.pathname.endsWith("/known")
        ? jsonResponse(200, { success: true, data: apiCompany({ slug: "known" }) })
        : jsonResponse(404, { success: false, data: null, error: { code: "not_found", message: "Entreprise introuvable." } }),
    );
    const repository = createApiCompanyRepository(BASE_URL, { fetchImpl });

    expect((await repository.findBySlug("known"))?.slug).toBe("known");
    expect(await repository.findBySlug("missing")).toBeNull();
    expect(urls[0]?.href).toBe("http://api.test/v1/companies/known");
  });

  it("maps sector counts to the UI shape and hides empty sectors", async () => {
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse(200, {
        success: true,
        data: [
          { slug: "sante", label: "Santé", count: 3 },
          { slug: "juridique", label: "Juridique", count: 0 },
        ],
      }),
    );

    const counts = await createApiCompanyRepository(BASE_URL, { fetchImpl }).sectorCounts();

    expect(counts).toEqual([{ sector: "sante", count: 3 }]);
  });

  it("returns city counts and slugs", async () => {
    const { fetchImpl } = fakeFetch((url) =>
      url.pathname === "/v1/cities"
        ? jsonResponse(200, { success: true, data: [{ city: "Dakar", count: 9 }] })
        : jsonResponse(200, { success: true, data: ["a", "b"] }),
    );
    const repository = createApiCompanyRepository(BASE_URL, { fetchImpl });

    expect(await repository.cityCounts()).toEqual([{ city: "Dakar", count: 9 }]);
    expect(await repository.allSlugs()).toEqual(["a", "b"]);
  });

  it("throws an ApiError carrying the API error code", async () => {
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse(429, { success: false, data: null, error: { code: "rate_limited", message: "Trop de requêtes." } }),
    );

    const failure = createApiCompanyRepository(BASE_URL, { fetchImpl }).cityCounts();

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("rejects responses that are not valid envelopes or data", async () => {
    const responses: readonly (() => Response)[] = [
      () => new Response("<html>bad gateway</html>", { status: 502 }),
      () => new Response("not json", { status: 200 }),
      () => jsonResponse(200, { success: true, data: [apiCompany({ slug: "Not A Slug" })], meta: { total: 1 } }),
      () => jsonResponse(200, { success: true, data: [], meta: {} }),
    ];

    for (const response of responses) {
      const { fetchImpl } = fakeFetch(response);
      await expect(createApiCompanyRepository(BASE_URL, { fetchImpl }).search({}, { offset: 0, limit: 12 })).rejects.toMatchObject({
        code: "invalid_response",
      });
    }
  });
});
