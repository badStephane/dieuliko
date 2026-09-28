import "server-only";
import { redirect } from "next/navigation";
import { CANDIDATE_HOME_PATH, loginHref } from "@/features/auth/redirects";
import { requestContext } from "@/features/auth/server";
import { ApiError } from "@/lib/api-client";
import { getServerApiClient } from "@/lib/server-api";
import { createCandidateApi, type CandidateApi, type Cv } from "./candidate-api";
import type { Profile } from "./profile";

export function getCandidateApi(): CandidateApi {
  return createCandidateApi(getServerApiClient());
}

export function isLostSession(error: unknown): boolean {
  return error instanceof ApiError && error.code === "unauthenticated";
}

/** Sends a candidate whose session expired back to the login page, then to `returnTo`. */
export function redirectOnLostSession(error: unknown, returnTo: string): void {
  if (isLostSession(error)) redirect(loginHref(returnTo));
}

export interface CandidateSpace {
  readonly profile: Profile;
  readonly cv: Cv | null;
}

/**
 * Profile and CV of the logged-in candidate, fetched together. Null when the API cannot answer, so the
 * page shows a degraded state instead of an error; a lost session goes back to the login page.
 */
export async function loadCandidateSpace(): Promise<CandidateSpace | null> {
  try {
    const [api, context] = [getCandidateApi(), await requestContext()];
    const [profile, cv] = await Promise.all([api.getProfile(context), api.getCv(context)]);
    return { profile, cv };
  } catch (error: unknown) {
    redirectOnLostSession(error, CANDIDATE_HOME_PATH);
    console.error("Candidate space unavailable", error);
    return null;
  }
}
