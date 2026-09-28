"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { errorState } from "@/features/auth/form-state";
import { redirectOnLostSession, requestContext, requireAdmin } from "@/features/auth/server";
import { companyHref } from "@/features/companies/search-params";
import { COMPANIES_PATH } from "@/lib/navigation";
import { companyInputSchema } from "./admin-api";
import { ADMIN_CANDIDATES_PATH, ADMIN_COMPANIES_PATH, ADMIN_HOME_PATH, adminCandidatePath, adminCompanyPath } from "./paths";
import { getAdminApi } from "./server";

const INVALID_REQUEST = "La demande n’a pas pu être lue. Rechargez la page puis réessayez.";
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const idSchema = z.string().uuid();

/** A back-office action's outcome; `fields` holds per-field messages of a rejected form. */
export type AdminResult =
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly message: string; readonly fields?: Readonly<Record<string, string>> };

function failure(error: unknown, returnTo: string, withFields: boolean): AdminResult {
  redirectOnLostSession(error, returnTo);
  const state = errorState(error);
  const message = state.message ?? INVALID_REQUEST;
  if (withFields && state.fields) return { status: "error", message, fields: state.fields };
  return { status: "error", message: Object.values(state.fields ?? {})[0] ?? message };
}

/** Refreshes every page showing the listing: public directory (cached for a day) and back-office. */
function revalidateCompany(slug: string): void {
  for (const path of [COMPANIES_PATH, companyHref(slug), ADMIN_COMPANIES_PATH, adminCompanyPath(slug), ADMIN_HOME_PATH]) revalidatePath(path);
}

function revalidateCandidate(id: string): void {
  for (const path of [ADMIN_CANDIDATES_PATH, adminCandidatePath(id), ADMIN_HOME_PATH]) revalidatePath(path);
}

/** Saves a listing: edits it when `slug` is given, otherwise creates it and opens its page. */
export async function saveCompanyAction(slug: unknown, input: unknown): Promise<AdminResult> {
  const parsedSlug = slug === null ? null : slugSchema.safeParse(slug);
  await requireAdmin(parsedSlug?.success ? adminCompanyPath(parsedSlug.data) : ADMIN_COMPANIES_PATH);
  const parsed = companyInputSchema.safeParse(input);
  if (!parsed.success || (parsedSlug && !parsedSlug.success)) return { status: "error", message: INVALID_REQUEST };
  const returnTo = parsedSlug ? adminCompanyPath(parsedSlug.data) : ADMIN_COMPANIES_PATH;
  let created: string;
  try {
    const context = await requestContext();
    if (parsedSlug) {
      await getAdminApi().updateCompany(parsedSlug.data, parsed.data, context);
      revalidateCompany(parsedSlug.data);
      return { status: "success", message: "La fiche est enregistrée." };
    }
    created = (await getAdminApi().createCompany(parsed.data, context)).slug;
  } catch (error: unknown) {
    return failure(error, returnTo, true);
  }
  revalidateCompany(created);
  redirect(adminCompanyPath(created));
}

async function toggleCompany(slug: unknown, flag: unknown, change: "hidden" | "verified"): Promise<AdminResult> {
  const parsed = z.object({ slug: slugSchema, flag: z.boolean() }).safeParse({ slug, flag });
  await requireAdmin(parsed.success ? adminCompanyPath(parsed.data.slug) : ADMIN_COMPANIES_PATH);
  if (!parsed.success) return { status: "error", message: INVALID_REQUEST };
  const { slug: target, flag: on } = parsed.data;
  try {
    const api = getAdminApi();
    const context = await requestContext();
    await (change === "hidden" ? api.setCompanyHidden(target, on, context) : api.setCompanyVerified(target, on, context));
  } catch (error: unknown) {
    return failure(error, adminCompanyPath(target), false);
  }
  revalidateCompany(target);
  const messages = {
    hidden: on ? "La fiche est masquée de l’annuaire." : "La fiche est de nouveau visible dans l’annuaire.",
    verified: on ? "La fiche est marquée vérifiée." : "La fiche n’est plus marquée vérifiée.",
  };
  return { status: "success", message: messages[change] };
}

export async function setCompanyHiddenAction(slug: unknown, hidden: unknown): Promise<AdminResult> {
  return toggleCompany(slug, hidden, "hidden");
}

export async function setCompanyVerifiedAction(slug: unknown, verified: unknown): Promise<AdminResult> {
  return toggleCompany(slug, verified, "verified");
}

export async function setCandidateSuspendedAction(id: unknown, suspended: unknown): Promise<AdminResult> {
  const parsed = z.object({ id: idSchema, suspended: z.boolean() }).safeParse({ id, suspended });
  await requireAdmin(parsed.success ? adminCandidatePath(parsed.data.id) : ADMIN_CANDIDATES_PATH);
  if (!parsed.success) return { status: "error", message: INVALID_REQUEST };
  try {
    await getAdminApi().setCandidateSuspended(parsed.data.id, parsed.data.suspended, await requestContext());
  } catch (error: unknown) {
    return failure(error, adminCandidatePath(parsed.data.id), false);
  }
  revalidateCandidate(parsed.data.id);
  return {
    status: "success",
    message: parsed.data.suspended
      ? "Le compte est suspendu. Le candidat a été prévenu par email."
      : "Le compte est réactivé. Le candidat a été prévenu par email.",
  };
}

/** Erases a candidate's account once its email is typed again, then goes back to the list. */
export async function deleteCandidateAction(id: unknown, confirmEmail: unknown): Promise<AdminResult> {
  const parsed = z.object({ id: idSchema, confirmEmail: z.string().max(254) }).safeParse({ id, confirmEmail });
  await requireAdmin(parsed.success ? adminCandidatePath(parsed.data.id) : ADMIN_CANDIDATES_PATH);
  if (!parsed.success) return { status: "error", message: INVALID_REQUEST };
  try {
    await getAdminApi().deleteCandidate(parsed.data.id, parsed.data.confirmEmail, await requestContext());
  } catch (error: unknown) {
    return failure(error, adminCandidatePath(parsed.data.id), false);
  }
  revalidateCandidate(parsed.data.id);
  redirect(ADMIN_CANDIDATES_PATH);
}
