import "server-only";
import { redirectOnLostSession, requestContext } from "@/features/auth/server";
import type { RequestOptions } from "@/lib/api-client";
import { getServerApiClient } from "@/lib/server-api";
import { z } from "zod";
import {
  createAdminApi,
  type AdminApi,
  type AdminCompany,
  type CandidateDetail,
  type CandidateSummary,
  type CompanySummary,
  type ListQuery,
  type Page,
  type Stats,
} from "./admin-api";
import { ADMIN_CANDIDATES_PATH, ADMIN_COMPANIES_PATH, ADMIN_HOME_PATH, adminCandidatePath, adminCompanyPath } from "./paths";

export function getAdminApi(): AdminApi {
  return createAdminApi(getServerApiClient());
}

/**
 * Runs a back-office read. Null when the API cannot answer, so the page shows a degraded state instead of an error;
 * a lost session goes back to the login page, then to `returnTo`.
 */
async function read<T>(returnTo: string, what: string, call: (api: AdminApi, context: RequestOptions) => Promise<T>): Promise<T | null> {
  try {
    return await call(getAdminApi(), await requestContext());
  } catch (error: unknown) {
    redirectOnLostSession(error, returnTo);
    console.error(`${what} unavailable`, error);
    return null;
  }
}

export function loadDashboard(): Promise<Stats | null> {
  return read(ADMIN_HOME_PATH, "Admin dashboard", (api, context) => api.getStats(context));
}

export function loadCompanies(query: ListQuery): Promise<Page<CompanySummary> | null> {
  return read(ADMIN_COMPANIES_PATH, "Admin companies", (api, context) => api.listCompanies(query, context));
}

/** `{ company: null }` when no listing has this slug; null when the API cannot answer. */
export function loadCompany(slug: string): Promise<{ readonly company: AdminCompany | null } | null> {
  return read(adminCompanyPath(slug), "Admin company", async (api, context) => ({ company: await api.getCompany(slug, context) }));
}

export function loadCandidates(query: ListQuery): Promise<Page<CandidateSummary> | null> {
  return read(ADMIN_CANDIDATES_PATH, "Admin candidates", (api, context) => api.listCandidates(query, context));
}

/** `{ candidate: null }` when no candidate has this id; null when the API cannot answer. */
export function loadCandidate(id: string): Promise<{ readonly candidate: CandidateDetail | null } | null> {
  if (!z.string().uuid().safeParse(id).success) return Promise.resolve({ candidate: null });
  return read(adminCandidatePath(id), "Admin candidate", async (api, context) => ({ candidate: await api.getCandidate(id, context) }));
}
