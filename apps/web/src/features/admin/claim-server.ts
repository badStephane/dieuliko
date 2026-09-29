import "server-only";
import { redirectOnLostSession, requestContext } from "@/features/auth/server";
import { getServerApiClient } from "@/lib/server-api";
import { createClaimsAdminApi, type ClaimDetail, type ClaimPage, type ClaimsAdminApi, type ClaimStatus } from "./claims-api";
import { ADMIN_CLAIMS_PATH, adminClaimPath } from "./paths";

export function getClaimsAdminApi(): ClaimsAdminApi {
  return createClaimsAdminApi(getServerApiClient());
}

/** Null when the API cannot answer, so the page shows a degraded state; a lost session goes to the login page. */
async function read<T>(returnTo: string, what: string, call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (error: unknown) {
    redirectOnLostSession(error, returnTo);
    console.error(`${what} unavailable`, error);
    return null;
  }
}

export async function loadClaims(status: ClaimStatus, offset: number, limit: number): Promise<ClaimPage | null> {
  return read(ADMIN_CLAIMS_PATH, "Admin claims", async () => getClaimsAdminApi().listClaims(status, offset, limit, await requestContext()));
}

/** `claim` is null when no claim has this id. */
export async function loadClaim(id: string): Promise<{ readonly claim: ClaimDetail | null } | null> {
  return read(adminClaimPath(id), "Admin claim", async () => ({ claim: await getClaimsAdminApi().getClaim(id, await requestContext()) }));
}
