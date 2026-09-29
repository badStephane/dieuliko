import "server-only";
import { redirectOnLostSession, requestContext } from "@/features/auth/server";
import { getServerApiClient } from "@/lib/server-api";
import { createCompanySpaceApi, type Claim, type CompanySpaceApi } from "./company-space-api";
import { COMPANY_SPACE_PATH } from "./paths";

export function getCompanySpaceApi(): CompanySpaceApi {
  return createCompanySpaceApi(getServerApiClient());
}

/**
 * The account's latest claim (`claim` null when it never asked for a listing). Null when the API cannot answer, so
 * the page shows a degraded state; a lost session goes back to the login page.
 */
export async function loadClaim(): Promise<{ readonly claim: Claim | null } | null> {
  try {
    return { claim: await getCompanySpaceApi().getClaim(await requestContext()) };
  } catch (error: unknown) {
    redirectOnLostSession(error, COMPANY_SPACE_PATH);
    console.error("Company claim unavailable", error);
    return null;
  }
}
