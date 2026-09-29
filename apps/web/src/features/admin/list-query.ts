import type { ListQuery } from "./admin-api";

export const PAGE_SIZE = 20;
const MAX_PAGE = 5000;
const MAX_QUERY_LENGTH = 100;

/** French `?statut=` values of the list pages, and the API status each one stands for. */
export const COMPANY_STATUSES: Readonly<Record<string, string>> = { visibles: "visible", masquees: "hidden" };
export const CANDIDATE_STATUSES: Readonly<Record<string, string>> = { actifs: "active", suspendus: "suspended" };
/** French `?statut=` values of the claims queue; without one, the queue shows the pending claims. */
export const CLAIM_STATUS_PARAMS: Readonly<Record<string, string>> = {
  acceptees: "approved",
  refusees: "rejected",
  revoquees: "revoked",
  annulees: "cancelled",
};
/** French `?statut=` values of the activity log: the kind of target. */
export const AUDIT_TYPES: Readonly<Record<string, string>> = { entreprises: "company", candidats: "user", revendications: "claim" };

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

export interface PageQuery extends ListQuery {
  /** The French status as found in the URL ("" when absent or unknown), to rebuild links. */
  readonly statusParam: string;
  readonly page: number;
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Reads `q`, `statut` and `page` from a list page's URL; anything invalid falls back to "no filter, page 1". */
export function listQueryFrom(params: SearchParams, statuses: Readonly<Record<string, string>>): PageQuery {
  const q = first(params.q).trim().slice(0, MAX_QUERY_LENGTH);
  const statusParam = first(params.statut);
  const status = Object.hasOwn(statuses, statusParam) ? (statuses[statusParam] ?? "") : "";
  const parsed = Number.parseInt(first(params.page), 10);
  const page = Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE ? parsed : 1;
  return { q, status, statusParam: status ? statusParam : "", page, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE };
}

/** French `?manque=` values of the listings list, and the API quality gap each one stands for. */
export const COMPANY_QUALITIES: Readonly<Record<string, string>> = {
  logo: "no-logo",
  description: "no-description",
  contact: "no-contact",
  verification: "unverified",
};
/** French `?tri=` values; without one the list is sorted by name. */
export const COMPANY_SORTS: Readonly<Record<string, string>> = { recentes: "updated" };
const DEFAULT_SORT = "name";

export interface CompanyPageQuery extends PageQuery {
  readonly quality: string;
  readonly qualityParam: string;
  readonly sort: string;
  readonly sortParam: string;
}

function known(params: SearchParams, name: string, values: Readonly<Record<string, string>>): { param: string; value: string } {
  const param = first(params[name]);
  const value = Object.hasOwn(values, param) ? (values[param] ?? "") : "";
  return { param: value ? param : "", value };
}

/** `listQueryFrom` for the listings list, plus `manque` (a quality gap) and `tri` (the sort order). */
export function companyQueryFrom(params: SearchParams): CompanyPageQuery {
  const quality = known(params, "manque", COMPANY_QUALITIES);
  const sort = known(params, "tri", COMPANY_SORTS);
  return {
    ...listQueryFrom(params, COMPANY_STATUSES),
    quality: quality.value,
    qualityParam: quality.param,
    sort: sort.value || DEFAULT_SORT,
    sortParam: sort.param,
  };
}

/** French `?etape=` values of the candidates list, and the API journey step each one stands for. */
export const CANDIDATE_PROGRESSES: Readonly<Record<string, string>> = {
  email: "unverified",
  profil: "no-profile",
  cv: "no-cv",
  postule: "applied",
};
/** French `?tri=` values of the candidates list; without one the newest accounts come first. */
export const CANDIDATE_SORTS: Readonly<Record<string, string>> = { nom: "name" };

export interface CandidatePageQuery extends PageQuery {
  readonly progress: string;
  readonly progressParam: string;
  readonly sort: string;
  readonly sortParam: string;
}

/** `listQueryFrom` for the candidates list, plus `etape` (a step of the journey) and `tri` (the sort order). */
export function candidateQueryFrom(params: SearchParams): CandidatePageQuery {
  const progress = known(params, "etape", CANDIDATE_PROGRESSES);
  const sort = known(params, "tri", CANDIDATE_SORTS);
  return {
    ...listQueryFrom(params, CANDIDATE_STATUSES),
    progress: progress.value,
    progressParam: progress.param,
    sort: sort.value || "newest",
    sortParam: sort.param,
  };
}
