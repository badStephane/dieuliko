import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PAGE_SIZE, type PageQuery } from "@/features/admin/list-query";
import { listHref } from "./list-href";
import { SECONDARY_ACTION } from "./styles";
import { countLabel } from "./text";

interface PaginationProps {
  readonly basePath: string;
  readonly query: PageQuery;
  readonly total: number;
  readonly noun: { readonly singular: string; readonly plural: string };
}

const DISABLED = `${SECONDARY_ACTION} pointer-events-none opacity-40`;

/** Result count, "Page X sur Y", and previous/next links that keep the filters. */
export function Pagination({ basePath, query, total, noun }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrevious = query.page > 1;
  const hasNext = query.page < pageCount;
  const previous = listHref(basePath, { ...query, page: Math.min(query.page - 1, pageCount) });
  const next = listHref(basePath, { ...query, page: query.page + 1 });

  return (
    <nav aria-label="Pagination" className="flex flex-col gap-3 tab:flex-row tab:items-center tab:justify-between">
      <p className="text-[16px] leading-6 text-ink-deep">
        {countLabel(total, noun.singular, noun.plural)} · Page {query.page} sur {pageCount}
      </p>
      {(hasPrevious || hasNext) && (
        <div className="flex gap-2">
          {hasPrevious ? (
            <Link href={previous} className={SECONDARY_ACTION}>
              <ChevronLeft aria-hidden className="size-5" />
              Précédent
            </Link>
          ) : (
            <span aria-disabled="true" className={DISABLED}>
              <ChevronLeft aria-hidden className="size-5" />
              Précédent
            </span>
          )}
          {hasNext ? (
            <Link href={next} className={SECONDARY_ACTION}>
              Suivant
              <ChevronRight aria-hidden className="size-5" />
            </Link>
          ) : (
            <span aria-disabled="true" className={DISABLED}>
              Suivant
              <ChevronRight aria-hidden className="size-5" />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
