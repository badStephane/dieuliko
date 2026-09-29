import { z } from "zod";
import { parseApiData, requireResponse, type ApiClient, type RequestOptions } from "@/lib/api-client";
import { CLAIM_STATUSES } from "@/features/company-space/company-space-api";

export { CLAIM_STATUSES };
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const requesterSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  /** Only on the detail. */
  createdAt: z.string().optional(),
});

const listingSchema = z.object({
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  /** Only on the detail. */
  website: z.string().optional(),
  email: z.string().optional(),
  verified: z.boolean(),
  hiddenAt: z.string().nullable(),
});

export const claimSummarySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CLAIM_STATUSES),
  jobTitle: z.string(),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
  requester: requesterSchema,
  company: listingSchema,
});

export const claimDetailSchema = claimSummarySchema.extend({
  phone: z.string(),
  message: z.string(),
  decisionReason: z.string().nullable(),
  /** A hint only: the requester's email shares the domain of the listing's website. */
  emailDomainMatches: z.boolean(),
  otherClaims: z.array(z.object({ id: z.string().uuid(), status: z.enum(CLAIM_STATUSES), createdAt: z.string(), name: z.string(), email: z.string() })),
});

export type ClaimSummary = z.infer<typeof claimSummarySchema>;
export type ClaimDetail = z.infer<typeof claimDetailSchema>;

const claimPageSchema = z.object({ items: z.array(claimSummarySchema), total: z.number().int().nonnegative() });
export type ClaimPage = z.infer<typeof claimPageSchema>;

const CLAIMS_PATH = "/admin/claims";
const claimPath = (id: string) => `${CLAIMS_PATH}/${encodeURIComponent(id)}`;

/** Back-office review of the company accounts' claims. */
export interface ClaimsAdminApi {
  /** Pending claims oldest first; the others most recently reviewed first. */
  listClaims(status: ClaimStatus, offset: number, limit: number, context: RequestOptions): Promise<ClaimPage>;
  /** Null when no claim has this id. */
  getClaim(id: string, context: RequestOptions): Promise<ClaimDetail | null>;
  approveClaim(id: string, context: RequestOptions): Promise<ClaimDetail>;
  rejectClaim(id: string, reason: string, context: RequestOptions): Promise<ClaimDetail>;
  revokeClaim(id: string, reason: string, context: RequestOptions): Promise<ClaimDetail>;
}

export function createClaimsAdminApi(client: ApiClient): ClaimsAdminApi {
  return {
    async listClaims(status, offset, limit, context) {
      const params = { status, offset: String(offset), limit: String(limit) };
      return parseApiData(claimPageSchema, requireResponse(await client.get(CLAIMS_PATH, { ...context, params }), CLAIMS_PATH), "claims");
    },
    async getClaim(id, context) {
      const response = await client.get(claimPath(id), context);
      return response ? parseApiData(claimDetailSchema, response, "claim") : null;
    },
    async approveClaim(id, context) {
      return parseApiData(claimDetailSchema, await client.post(`${claimPath(id)}/approval`, undefined, context), "approved claim");
    },
    async rejectClaim(id, reason, context) {
      return parseApiData(claimDetailSchema, await client.post(`${claimPath(id)}/rejection`, { reason }, context), "rejected claim");
    },
    async revokeClaim(id, reason, context) {
      return parseApiData(claimDetailSchema, await client.post(`${claimPath(id)}/revocation`, { reason }, context), "revoked claim");
    },
  };
}

const STATUS_LABELS: Readonly<Record<ClaimStatus, string>> = {
  pending: "En attente",
  approved: "Acceptée",
  rejected: "Refusée",
  cancelled: "Annulée",
  revoked: "Révoquée",
};

export function claimStatusLabel(status: ClaimStatus): string {
  return STATUS_LABELS[status];
}
