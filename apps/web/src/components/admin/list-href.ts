import type { CompanyPageQuery, PageQuery } from "@/features/admin/list-query";

type ListLocation = Pick<PageQuery, "q" | "statusParam" | "page"> & Partial<Pick<CompanyPageQuery, "qualityParam" | "sortParam">>;

/** URL of a list page keeping the search and the filters; page 1 and empty values are left out. */
export function listHref(basePath: string, { q, statusParam, page, qualityParam, sortParam }: ListLocation): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (statusParam) params.set("statut", statusParam);
  if (qualityParam) params.set("manque", qualityParam);
  if (sortParam) params.set("tri", sortParam);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
