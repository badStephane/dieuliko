import { z } from "zod";
import { parseApiData, requireResponse, type ApiClient, type RequestOptions } from "@/lib/api-client";

export const statsSchema = z.object({
  candidates: z.object({
    total: z.number(),
    last7Days: z.number(),
    last30Days: z.number(),
    verifiedEmails: z.number(),
    suspended: z.number(),
    withProfile: z.number(),
    withCv: z.number(),
  }),
  letters: z.number(),
  applications: z.object({ sent: z.number(), withdrawn: z.number() }),
  companies: z.object({ visible: z.number(), hidden: z.number(), verified: z.number() }),
  topCompanies: z.array(z.object({ slug: z.string(), name: z.string(), city: z.string(), applications: z.number() })),
});

/** A listing as the back-office edits it; empty strings are missing optional values. */
export const companyInputSchema = z.object({
  name: z.string(),
  sector: z.string(),
  city: z.string(),
  companyType: z.string(),
  description: z.string(),
  website: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
  size: z.string(),
  socialLinks: z.record(z.string(), z.string()),
});

export const adminCompanySchema = companyInputSchema.extend({
  slug: z.string(),
  verified: z.boolean(),
  hiddenAt: z.string().nullable(),
  curatedAt: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const companySummarySchema = adminCompanySchema.pick({
  slug: true,
  name: true,
  sector: true,
  city: true,
  verified: true,
  hiddenAt: true,
  curatedAt: true,
  source: true,
  updatedAt: true,
});

export const candidateSummarySchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  emailVerified: z.boolean(),
  suspendedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** What the back-office may know about a candidate: status and counts, never the content of their space. */
export const candidateDetailSchema = candidateSummarySchema.extend({
  hasProfile: z.boolean(),
  hasCv: z.boolean(),
  letters: z.number(),
  applicationsSent: z.number(),
  applicationsWithdrawn: z.number(),
});

const pageOf = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), total: z.number().int().nonnegative() });

export type Stats = z.infer<typeof statsSchema>;
export type CompanyInput = z.infer<typeof companyInputSchema>;
export type AdminCompany = z.infer<typeof adminCompanySchema>;
export type CompanySummary = z.infer<typeof companySummarySchema>;
export type CandidateSummary = z.infer<typeof candidateSummarySchema>;
export type CandidateDetail = z.infer<typeof candidateDetailSchema>;
export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/** A list request; empty `q` and `status` do not filter. */
export interface ListQuery {
  readonly q: string;
  readonly status: string;
  readonly offset: number;
  readonly limit: number;
}

const companyPath = (slug: string) => `/admin/companies/${encodeURIComponent(slug)}`;
const candidatePath = (id: string) => `/admin/candidates/${encodeURIComponent(id)}`;

function listParams({ q, status, offset, limit }: ListQuery): Record<string, string> {
  return {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(status ? { status } : {}),
    offset: String(offset),
    limit: String(limit),
  };
}

/** Calls to `/v1/admin`, always made with the admin's session carried by `context`. */
export interface AdminApi {
  getStats(context: RequestOptions): Promise<Stats>;
  listCompanies(query: ListQuery, context: RequestOptions): Promise<Page<CompanySummary>>;
  /** Null when no listing has this slug. */
  getCompany(slug: string, context: RequestOptions): Promise<AdminCompany | null>;
  createCompany(input: Partial<CompanyInput>, context: RequestOptions): Promise<AdminCompany>;
  updateCompany(slug: string, input: Partial<CompanyInput>, context: RequestOptions): Promise<AdminCompany>;
  setCompanyHidden(slug: string, hidden: boolean, context: RequestOptions): Promise<AdminCompany>;
  setCompanyVerified(slug: string, verified: boolean, context: RequestOptions): Promise<AdminCompany>;
  listCandidates(query: ListQuery, context: RequestOptions): Promise<Page<CandidateSummary>>;
  /** Null when no candidate has this id. */
  getCandidate(id: string, context: RequestOptions): Promise<CandidateDetail | null>;
  setCandidateSuspended(id: string, suspended: boolean, context: RequestOptions): Promise<CandidateDetail>;
  /** Erases the account; `confirmEmail` must repeat its address. */
  deleteCandidate(id: string, confirmEmail: string, context: RequestOptions): Promise<void>;
}

export function createAdminApi(client: ApiClient): AdminApi {
  return {
    async getStats(context) {
      return parseApiData(statsSchema, requireResponse(await client.get("/admin/stats", context), "/admin/stats"), "admin stats");
    },
    async listCompanies(query, context) {
      const response = requireResponse(await client.get("/admin/companies", { ...context, params: listParams(query) }), "/admin/companies");
      return parseApiData(pageOf(companySummarySchema), response, "admin companies");
    },
    async getCompany(slug, context) {
      const response = await client.get(companyPath(slug), context);
      return response ? parseApiData(adminCompanySchema, response, "admin company") : null;
    },
    async createCompany(input, context) {
      return parseApiData(adminCompanySchema, await client.post("/admin/companies", input, context), "created company");
    },
    async updateCompany(slug, input, context) {
      return parseApiData(adminCompanySchema, await client.put(companyPath(slug), input, context), "updated company");
    },
    async setCompanyHidden(slug, hidden, context) {
      return parseApiData(adminCompanySchema, await client.put(`${companyPath(slug)}/visibility`, { hidden }, context), "company visibility");
    },
    async setCompanyVerified(slug, verified, context) {
      return parseApiData(adminCompanySchema, await client.put(`${companyPath(slug)}/verification`, { verified }, context), "company verification");
    },
    async listCandidates(query, context) {
      const response = requireResponse(await client.get("/admin/candidates", { ...context, params: listParams(query) }), "/admin/candidates");
      return parseApiData(pageOf(candidateSummarySchema), response, "admin candidates");
    },
    async getCandidate(id, context) {
      const response = await client.get(candidatePath(id), context);
      return response ? parseApiData(candidateDetailSchema, response, "admin candidate") : null;
    },
    async setCandidateSuspended(id, suspended, context) {
      return parseApiData(candidateDetailSchema, await client.put(`${candidatePath(id)}/suspension`, { suspended }, context), "candidate suspension");
    },
    async deleteCandidate(id, confirmEmail, context) {
      await client.post(`${candidatePath(id)}/deletion`, { confirmEmail }, context);
    },
  };
}
