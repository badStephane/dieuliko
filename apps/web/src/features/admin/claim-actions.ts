"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestContext, requireAdmin } from "@/features/auth/server";
import { COMPANIES_PATH } from "@/lib/navigation";
import { companyHref } from "@/features/companies/search-params";
import type { ClaimDetail, ClaimsAdminApi } from "./claims-api";
import { getClaimsAdminApi } from "./claim-server";
import { ADMIN_CLAIMS_PATH, ADMIN_COMPANIES_PATH, ADMIN_HOME_PATH, adminClaimPath, adminCompanyPath } from "./paths";
import { failure, INVALID_REQUEST, type AdminResult } from "./result";

const idSchema = z.string().uuid();
const reasonSchema = z.string().max(2000);

/** Refreshes the queue, the claim and the listing, whose verified badge an approval changes. */
function revalidateClaim(claim: ClaimDetail): void {
  const slug = claim.company.slug;
  for (const path of [ADMIN_CLAIMS_PATH, adminClaimPath(claim.id), ADMIN_HOME_PATH, ADMIN_COMPANIES_PATH, adminCompanyPath(slug), COMPANIES_PATH, companyHref(slug)]) {
    revalidatePath(path);
  }
}

async function decide(
  rawId: unknown,
  decision: (api: ClaimsAdminApi, id: string) => Promise<ClaimDetail>,
  message: string,
): Promise<AdminResult> {
  const parsed = idSchema.safeParse(rawId);
  await requireAdmin(parsed.success ? adminClaimPath(parsed.data) : ADMIN_CLAIMS_PATH);
  if (!parsed.success) return { status: "error", message: INVALID_REQUEST };
  let claim: ClaimDetail;
  try {
    claim = await decision(getClaimsAdminApi(), parsed.data);
  } catch (error: unknown) {
    return failure(error, adminClaimPath(parsed.data), true);
  }
  revalidateClaim(claim);
  return { status: "success", message };
}

/** Makes the requester the manager of the listing. */
export async function approveClaimAction(id: unknown): Promise<AdminResult> {
  return decide(id, async (api, claimId) => api.approveClaim(claimId, await requestContext()), "Demande acceptée. Le demandeur a été prévenu par email.");
}

/** Turns the request down; the reason is emailed to the requester. */
export async function rejectClaimAction(id: unknown, reason: unknown): Promise<AdminResult> {
  const text = reasonSchema.safeParse(reason);
  if (!text.success) return { status: "error", message: INVALID_REQUEST };
  return decide(id, async (api, claimId) => api.rejectClaim(claimId, text.data, await requestContext()), "Demande refusée. Le demandeur a été prévenu par email.");
}

/** Ends an approved claim; the reason is emailed to the former manager. */
export async function revokeClaimAction(id: unknown, reason: unknown): Promise<AdminResult> {
  const text = reasonSchema.safeParse(reason);
  if (!text.success) return { status: "error", message: INVALID_REQUEST };
  return decide(id, async (api, claimId) => api.revokeClaim(claimId, text.data, await requestContext()), "Accès retiré. Le gestionnaire a été prévenu par email.");
}
