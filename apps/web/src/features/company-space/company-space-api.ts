import { z } from "zod";
import { parseApiData, requireResponse, type ApiClient, type RequestOptions } from "@/lib/api-client";

export const CLAIM_STATUSES = ["pending", "approved", "rejected", "cancelled", "revoked"] as const;

export const claimSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CLAIM_STATUSES),
  jobTitle: z.string(),
  phone: z.string(),
  message: z.string(),
  /** Why a request was rejected or an access revoked. */
  decisionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
  company: z.object({ slug: z.string(), name: z.string(), city: z.string(), logoVersion: z.string().nullable() }),
});

export type Claim = z.infer<typeof claimSchema>;

/** What the requester says about the listing and themselves. */
export interface ClaimRequest {
  readonly companySlug: string;
  readonly jobTitle: string;
  readonly phone: string;
  readonly message: string;
}

const CLAIM_PATH = "/company/claim";

/** Calls to `/v1/company`, always made for the session carried by `context`. */
export interface CompanySpaceApi {
  /** The account's most recent claim, whatever its status, or null when it never asked for a listing. */
  getClaim(context: RequestOptions): Promise<Claim | null>;
  requestClaim(input: ClaimRequest, context: RequestOptions): Promise<Claim>;
  /** Withdraws the pending claim. */
  cancelClaim(context: RequestOptions): Promise<void>;
}

export function createCompanySpaceApi(client: ApiClient): CompanySpaceApi {
  return {
    async getClaim(context) {
      const response = requireResponse(await client.get(CLAIM_PATH, context), CLAIM_PATH);
      return parseApiData(claimSchema.nullable(), response, "claim");
    },
    async requestClaim(input, context) {
      return parseApiData(claimSchema, await client.post(CLAIM_PATH, input, context), "requested claim");
    },
    async cancelClaim(context) {
      await client.delete(CLAIM_PATH, context);
    },
  };
}

const HEADLINES: Readonly<Record<Claim["status"], string>> = {
  pending: "Demande en cours d’examen",
  approved: "Vous gérez cette fiche",
  rejected: "Demande non acceptée",
  revoked: "Accès retiré",
  cancelled: "Demande annulée",
};

/** One line saying where the claim stands. */
export function claimHeadline(claim: Pick<Claim, "status">): string {
  return HEADLINES[claim.status];
}
