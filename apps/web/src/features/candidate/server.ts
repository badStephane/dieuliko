import "server-only";
import { redirect } from "next/navigation";
import { CANDIDATE_HOME_PATH, loginHref } from "@/features/auth/redirects";
import { requestContext } from "@/features/auth/server";
import { ApiError } from "@/lib/api-client";
import { getServerApiClient } from "@/lib/server-api";
import { createCandidateApi, type CandidateApi, type Cv, type Letter } from "./candidate-api";
import { letterPath } from "./paths";
import { hasProfileContent, type Profile } from "./profile";

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
  readonly letters: readonly Letter[];
}

/**
 * Profile and CV of the logged-in candidate, fetched together. Null when the API cannot answer, so the
 * page shows a degraded state instead of an error; a lost session goes back to the login page.
 */
export async function loadCandidateSpace(): Promise<CandidateSpace | null> {
  try {
    const [api, context] = [getCandidateApi(), await requestContext()];
    const [profile, cv, letters] = await Promise.all([api.getProfile(context), api.getCv(context), api.listLetters(context)]);
    return { profile, cv, letters };
  } catch (error: unknown) {
    redirectOnLostSession(error, CANDIDATE_HOME_PATH);
    console.error("Candidate space unavailable", error);
    return null;
  }
}

export interface LetterPage {
  readonly letter: Letter | null;
  /** False when the profile is too empty for the assistant to write from. */
  readonly isProfileReady: boolean;
}

/** The candidate's letter for a company (null if none yet) and whether their profile can feed the assistant. */
export async function loadLetterPage(slug: string): Promise<LetterPage | null> {
  try {
    const [api, context] = [getCandidateApi(), await requestContext()];
    const [letter, profile] = await Promise.all([api.getLetter(slug, context), api.getProfile(context)]);
    return { letter, isProfileReady: hasProfileContent(profile) };
  } catch (error: unknown) {
    redirectOnLostSession(error, letterPath(slug));
    console.error("Letter page unavailable", error);
    return null;
  }
}
