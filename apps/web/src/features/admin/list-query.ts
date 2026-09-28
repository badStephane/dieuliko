import type { ListQuery } from "./admin-api";

export const PAGE_SIZE = 20;
const MAX_PAGE = 5000;
const MAX_QUERY_LENGTH = 100;

/** French `?statut=` values of the list pages, and the API status each one stands for. */
export const COMPANY_STATUSES: Readonly<Record<string, string>> = { visibles: "visible", masquees: "hidden" };
export const CANDIDATE_STATUSES: Readonly<Record<string, string>> = { actifs: "active", suspendus: "suspended" };

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
