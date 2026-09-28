import { Search } from "lucide-react";
import Link from "next/link";
import { CONTROL, PRIMARY_ACTION, TEXT_LINK } from "./styles";

export interface StatusOption {
  /** French `?statut=` value; "" for no filter. */
  readonly value: string;
  readonly label: string;
}

interface ListSearchFormProps {
  readonly basePath: string;
  readonly q: string;
  readonly statusParam: string;
  readonly searchLabel: string;
  readonly placeholder: string;
  readonly statusOptions: readonly StatusOption[];
}

const MAX_QUERY_LENGTH = 100;

/** GET search form of a back-office list: a text query and a status filter, always back to page 1. */
export function ListSearchForm({ basePath, q, statusParam, searchLabel, placeholder, statusOptions }: ListSearchFormProps) {
  const hasFilters = q !== "" || statusParam !== "";
  return (
    // The key resets the uncontrolled fields when the URL changes (e.g. after "Réinitialiser").
    <form key={`${q}|${statusParam}`} action={basePath} method="get" role="search" className="flex flex-col gap-4 tab:flex-row tab:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor="admin-search-q" className="text-[16px] leading-6 font-medium text-ink">
          {searchLabel}
        </label>
        <input id="admin-search-q" type="search" name="q" defaultValue={q} maxLength={MAX_QUERY_LENGTH} placeholder={placeholder} className={CONTROL} />
      </div>
      <div className="flex flex-col gap-1.5 tab:w-[200px]">
        <label htmlFor="admin-search-statut" className="text-[16px] leading-6 font-medium text-ink">
          Statut
        </label>
        <select id="admin-search-statut" name="statut" defaultValue={statusParam} className={`${CONTROL} cursor-pointer`}>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={PRIMARY_ACTION}>
        <Search aria-hidden className="size-5" />
        Rechercher
      </button>
      {hasFilters && (
        <Link href={basePath} className={`${TEXT_LINK} justify-center tab:self-center`}>
          Réinitialiser
        </Link>
      )}
    </form>
  );
}
