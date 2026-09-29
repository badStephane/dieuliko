import { z } from "zod";
import { parseApiData, requireResponse, type ApiClient, type RequestOptions } from "@/lib/api-client";

const trendSchema = z.object({ last7Days: z.number(), previous7Days: z.number() });

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
  /** Last 7 days against the 7 before. */
  trends: z.object({ signups: trendSchema, applications: trendSchema, letters: trendSchema }),
  /** Listings to complete, with the rules of the list's quality tabs. */
  quality: z.object({ noLogo: z.number(), noDescription: z.number(), noContact: z.number(), unverified: z.number() }),
  /** The last 30 days, oldest first; `day` is a Dakar date ("2026-09-29"). */
  daily: z.array(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), signups: z.number(), applications: z.number() })),
  recentCandidates: z.array(z.object({ id: z.string().uuid(), firstName: z.string(), lastName: z.string(), createdAt: z.string() })),
  /** Which listing received an application and when; never who applied. */
  recentApplications: z.array(z.object({ slug: z.string(), name: z.string(), createdAt: z.string() })),
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
  /** Identifies the uploaded logo (null: none); it changes with every upload. */
  logoVersion: z.string().nullable(),
  verified: z.boolean(),
  hiddenAt: z.string().nullable(),
  curatedAt: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Applications (sent or withdrawn) block the deletion; letters go with the listing. */
  applications: z.number().int().nonnegative(),
  letters: z.number().int().nonnegative(),
});

const companySummarySchema = adminCompanySchema.pick({
  slug: true,
  name: true,
  sector: true,
  city: true,
  logoVersion: true,
  verified: true,
  hiddenAt: true,
  curatedAt: true,
  source: true,
  updatedAt: true,
});

/** What the back-office may know about a candidate: status and steps taken, never the content of their space. */
export const candidateSummarySchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  emailVerified: z.boolean(),
  suspendedAt: z.string().nullable(),
  createdAt: z.string(),
  hasProfile: z.boolean(),
  hasCv: z.boolean(),
  applicationsSent: z.number(),
});

export const candidateDetailSchema = candidateSummarySchema.extend({
  letters: z.number(),
  applicationsWithdrawn: z.number(),
});

export const auditEntrySchema = z.object({
  id: z.number(),
  action: z.string(),
  targetType: z.enum(["company", "user"]),
  targetId: z.string(),
  /** The listing's name or the candidate's name today; "" once it is gone. */
  targetLabel: z.string(),
  changedFields: z.array(z.string()),
  /** "" once the admin's account is gone. */
  adminName: z.string(),
  createdAt: z.string(),
});

const pageOf = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), total: z.number().int().nonnegative() });

export type Stats = z.infer<typeof statsSchema>;
export type CompanyInput = z.infer<typeof companyInputSchema>;
export type AdminCompany = z.infer<typeof adminCompanySchema>;
export type CompanySummary = z.infer<typeof companySummarySchema>;
export type CandidateSummary = z.infer<typeof candidateSummarySchema>;
export type CandidateDetail = z.infer<typeof candidateDetailSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
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
  /** Listings only: a quality gap to fix ("no-logo"…). */
  readonly quality?: string;
  /** Candidates only: a step of the journey ("unverified", "no-cv"…). */
  readonly progress?: string;
  /** "name", or "updated" (listings) / "newest" (candidates). */
  readonly sort?: string;
}

const companyPath = (slug: string) => `/admin/companies/${encodeURIComponent(slug)}`;
const candidatePath = (id: string) => `/admin/candidates/${encodeURIComponent(id)}`;

function listParams({ q, status, offset, limit, quality, progress, sort }: ListQuery): Record<string, string> {
  return {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(status ? { status } : {}),
    ...(quality ? { quality } : {}),
    ...(progress ? { progress } : {}),
    ...(sort ? { sort } : {}),
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
  /** Replaces the listing's logo with `file` (PNG, JPEG or WebP, 2 MB at most). */
  uploadLogo(slug: string, file: File, context: RequestOptions): Promise<AdminCompany>;
  removeLogo(slug: string, context: RequestOptions): Promise<AdminCompany>;
  /** The logo file to stream, null when the listing has none. */
  downloadLogo(slug: string, context: RequestOptions): Promise<Response | null>;
  listCandidates(query: ListQuery, context: RequestOptions): Promise<Page<CandidateSummary>>;
  /** Null when no candidate has this id. */
  getCandidate(id: string, context: RequestOptions): Promise<CandidateDetail | null>;
  setCandidateSuspended(id: string, suspended: boolean, context: RequestOptions): Promise<CandidateDetail>;
  /** Erases the account; `confirmEmail` must repeat its address. */
  deleteCandidate(id: string, confirmEmail: string, context: RequestOptions): Promise<void>;
  /** Erases a listing; `confirmName` must repeat its name. Refused ("company_has_applications") once candidates applied. */
  deleteCompany(slug: string, confirmName: string, context: RequestOptions): Promise<void>;
  /** The activity log, newest first; `status` is "company", "user" or "" for everything. */
  listAudit(query: ListQuery, context: RequestOptions): Promise<Page<AuditEntry>>;
  /** Hides, shows, verifies or unverifies several listings; returns how many changed. */
  bulkCompanies(action: BulkAction, slugs: readonly string[], context: RequestOptions): Promise<number>;
}

export const BULK_ACTIONS = ["hide", "unhide", "verify", "unverify"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
/** Mirrors admin.MaxBulkSlugs of the API. */
export const MAX_BULK_SLUGS = 100;

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
    async uploadLogo(slug, file, context) {
      const form = new FormData();
      form.append("file", file);
      return parseApiData(adminCompanySchema, await client.put(`${companyPath(slug)}/logo`, form, context), "company logo");
    },
    async removeLogo(slug, context) {
      return parseApiData(adminCompanySchema, await client.delete(`${companyPath(slug)}/logo`, context), "company logo removal");
    },
    downloadLogo(slug, context) {
      return client.download(`${companyPath(slug)}/logo`, context);
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
    async deleteCompany(slug, confirmName, context) {
      await client.post(`${companyPath(slug)}/deletion`, { confirmName }, context);
    },
    async listAudit({ status, offset, limit }, context) {
      const params = { ...(status ? { type: status } : {}), offset: String(offset), limit: String(limit) };
      const response = requireResponse(await client.get("/admin/audit", { ...context, params }), "/admin/audit");
      return parseApiData(pageOf(auditEntrySchema), response, "admin audit");
    },
    async bulkCompanies(action, slugs, context) {
      const response = await client.post("/admin/companies/bulk", { action, slugs }, context);
      return parseApiData(z.object({ updated: z.number().int().nonnegative() }), response, "bulk result").updated;
    },
  };
}
