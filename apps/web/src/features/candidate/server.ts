import "server-only";
import { redirect } from "next/navigation";
import { CANDIDATE_HOME_PATH, loginHref } from "@/features/auth/redirects";
import { requestContext } from "@/features/auth/server";
import { ApiError } from "@/lib/api-client";
import { getServerApiClient } from "@/lib/server-api";
import { z } from "zod";
import { createCandidateApi, type Application, type ApplicationDetail, type CandidateApi, type Cv, type Letter } from "./candidate-api";
import { applicationPath, letterPath } from "./paths";
import { hasProfileContent, undescribedExperiences, type Profile } from "./profile";

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
  readonly applications: readonly Application[];
}

/**
 * Profile and CV of the logged-in candidate, fetched together. Null when the API cannot answer, so the
 * page shows a degraded state instead of an error; a lost session goes back to the login page.
 */
export async function loadCandidateSpace(): Promise<CandidateSpace | null> {
  try {
    const [api, context] = [getCandidateApi(), await requestContext()];
    const [profile, cv, letters, applications] = await Promise.all([
      api.getProfile(context),
      api.getCv(context),
      api.listLetters(context),
      api.listApplications(context),
    ]);
    return { profile, cv, letters, applications };
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
  /** Titles of the experiences whose missions are not described yet. */
  readonly undescribedExperiences: readonly string[];
  readonly hasCv: boolean;
  /** The application currently sent to this company, if any. */
  readonly application: Application | null;
}

/** Everything the letter page needs: the letter, what an application still lacks, and the one already sent. */
export async function loadLetterPage(slug: string): Promise<LetterPage | null> {
  try {
    const [api, context] = [getCandidateApi(), await requestContext()];
    const [letter, profile, cv, applications] = await Promise.all([
      api.getLetter(slug, context),
      api.getProfile(context),
      api.getCv(context),
      api.listApplications(context),
    ]);
    return {
      letter,
      isProfileReady: hasProfileContent(profile),
      undescribedExperiences: undescribedExperiences(profile),
      hasCv: cv !== null,
      application: applications.find((item) => item.companySlug === slug && item.status === "sent") ?? null,
    };
  } catch (error: unknown) {
    redirectOnLostSession(error, letterPath(slug));
    console.error("Letter page unavailable", error);
    return null;
  }
}

const idSchema = z.string().uuid();

/** One of the candidate's applications (null when missing); null overall when the API cannot answer. */
export async function loadApplicationPage(id: string): Promise<{ readonly application: ApplicationDetail | null } | null> {
  if (!idSchema.safeParse(id).success) return { application: null };
  try {
    return { application: await getCandidateApi().getApplication(id, await requestContext()) };
  } catch (error: unknown) {
    redirectOnLostSession(error, applicationPath(id));
    console.error("Application page unavailable", error);
    return null;
  }
}
