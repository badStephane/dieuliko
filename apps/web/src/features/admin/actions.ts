"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { errorState } from "@/features/auth/form-state";
import { redirectOnLostSession, requestContext, requireAdmin } from "@/features/auth/server";
import { LOGO_MISSING, logoFileError } from "@/features/companies/logo";
import { companyHref } from "@/features/companies/search-params";
import { COMPANIES_PATH } from "@/lib/navigation";
import { BULK_ACTIONS, companyInputSchema, MAX_BULK_SLUGS, type BulkAction } from "./admin-api";
import { ADMIN_AUDIT_PATH, ADMIN_CANDIDATES_PATH, ADMIN_COMPANIES_PATH, ADMIN_HOME_PATH, adminCandidatePath, adminCompanyPath } from "./paths";
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

/** Replaces a listing's logo with the "file" field of `formData`. */
export async function uploadCompanyLogoAction(slug: unknown, formData: FormData): Promise<AdminResult> {
  const parsed = slugSchema.safeParse(slug);
  await requireAdmin(parsed.success ? adminCompanyPath(parsed.data) : ADMIN_COMPANIES_PATH);
  if (!parsed.success) return { status: "error", message: INVALID_REQUEST };
  const file = formData.get("file");
  const problem = logoFileError(file);
  if (problem || !(file instanceof File)) return { status: "error", message: problem ?? LOGO_MISSING };
  try {
    await getAdminApi().uploadLogo(parsed.data, file, await requestContext());
  } catch (error: unknown) {
    return failure(error, adminCompanyPath(parsed.data), false);
  }
  revalidateCompany(parsed.data);
  return { status: "success", message: "Le logo est enregistré." };
}

export async function removeCompanyLogoAction(slug: unknown): Promise<AdminResult> {
  const parsed = slugSchema.safeParse(slug);
  await requireAdmin(parsed.success ? adminCompanyPath(parsed.data) : ADMIN_COMPANIES_PATH);
  if (!parsed.success) return { status: "error", message: INVALID_REQUEST };
  try {
    await getAdminApi().removeLogo(parsed.data, await requestContext());
  } catch (error: unknown) {
    return failure(error, adminCompanyPath(parsed.data), false);
  }
  revalidateCompany(parsed.data);
  return { status: "success", message: "Le logo est retiré." };
}

/** Erases a listing once its name is typed again, then goes back to the list. */
export async function deleteCompanyAction(slug: unknown, confirmName: unknown): Promise<AdminResult> {
  const parsed = z.object({ slug: slugSchema, confirmName: z.string().max(200) }).safeParse({ slug, confirmName });
  await requireAdmin(parsed.success ? adminCompanyPath(parsed.data.slug) : ADMIN_COMPANIES_PATH);
  if (!parsed.success) return { status: "error", message: INVALID_REQUEST };
  try {
    await getAdminApi().deleteCompany(parsed.data.slug, parsed.data.confirmName, await requestContext());
  } catch (error: unknown) {
    return failure(error, adminCompanyPath(parsed.data.slug), false);
  }
  revalidateCompany(parsed.data.slug);
  revalidatePath(ADMIN_AUDIT_PATH);
  redirect(ADMIN_COMPANIES_PATH);
}

const BULK_MESSAGES: Readonly<Record<BulkAction, readonly [string, string]>> = {
  hide: ["fiche masquée", "fiches masquées"],
  unhide: ["fiche de nouveau visible", "fiches de nouveau visibles"],
  verify: ["fiche marquée vérifiée", "fiches marquées vérifiées"],
  unverify: ["fiche n’est plus marquée vérifiée", "fiches ne sont plus marquées vérifiées"],
};

/** Hides, shows, verifies or unverifies the selected listings of the back-office list. */
export async function bulkCompaniesAction(action: unknown, slugs: unknown): Promise<AdminResult> {
  await requireAdmin(ADMIN_COMPANIES_PATH);
  const parsed = z
    .object({ action: z.enum(BULK_ACTIONS), slugs: z.array(slugSchema).min(1).max(MAX_BULK_SLUGS) })
    .safeParse({ action, slugs });
  if (!parsed.success) return { status: "error", message: INVALID_REQUEST };
  let updated: number;
  try {
    updated = await getAdminApi().bulkCompanies(parsed.data.action, parsed.data.slugs, await requestContext());
  } catch (error: unknown) {
    return failure(error, ADMIN_COMPANIES_PATH, false);
  }
  for (const slug of parsed.data.slugs) revalidateCompany(slug);
  const [singular, plural] = BULK_MESSAGES[parsed.data.action];
  return { status: "success", message: `${updated} ${updated > 1 ? plural : singular}.` };
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
