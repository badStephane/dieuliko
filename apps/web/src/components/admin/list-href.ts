import type { PageQuery } from "@/features/admin/list-query";

type ListLocation = Pick<PageQuery, "q" | "statusParam" | "page">;

/** URL of a list page keeping the search and the status filter; page 1 and empty values are left out. */
export function listHref(basePath: string, { q, statusParam, page }: ListLocation): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (statusParam) params.set("statut", statusParam);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
