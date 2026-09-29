import { Search } from "lucide-react";
import Link from "next/link";
import { CONTROL, PRIMARY_ACTION, TEXT_LINK } from "./styles";

export interface StatusOption {
  /** French `?statut=` value; "" for no filter. */
  readonly value: string;
  readonly label: string;
}

/** Another select of the form, sent as `?name=`. */
export interface ExtraSelect {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly StatusOption[];
}

interface ListSearchFormProps {
  readonly basePath: string;
  readonly q: string;
  readonly statusParam: string;
  readonly searchLabel: string;
  readonly placeholder: string;
  readonly statusOptions: readonly StatusOption[];
  readonly extraSelects?: readonly ExtraSelect[];
  /** Filters set elsewhere on the page (e.g. tabs) that a new search keeps. */
  readonly keptParams?: Readonly<Record<string, string>>;
}

const MAX_QUERY_LENGTH = 100;

/** GET search form of a back-office list: a text query and a status filter, always back to page 1. */
export function ListSearchForm({ basePath, q, statusParam, searchLabel, placeholder, statusOptions, extraSelects = [], keptParams = {} }: ListSearchFormProps) {
  const hasFilters = q !== "" || statusParam !== "" || extraSelects.some((select) => select.value !== "");
  const kept = Object.entries(keptParams).filter(([, value]) => value !== "");
  return (
    // The key resets the uncontrolled fields when the URL changes (e.g. after "Réinitialiser").
    <form
      key={[q, statusParam, ...extraSelects.map((select) => select.value), ...kept.flat()].join("|")}
      action={basePath}
      method="get"
      role="search"
      className="flex flex-col gap-4 tab:flex-row tab:flex-wrap tab:items-end"
    >
      {kept.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
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
      {extraSelects.map((select) => (
        <div key={select.name} className="flex flex-col gap-1.5 tab:w-[200px]">
          <label htmlFor={`admin-search-${select.name}`} className="text-[16px] leading-6 font-medium text-ink">
            {select.label}
          </label>
          <select id={`admin-search-${select.name}`} name={select.name} defaultValue={select.value} className={`${CONTROL} cursor-pointer`}>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button type="submit" className={PRIMARY_ACTION}>
        <Search aria-hidden className="size-5" />
        Rechercher
      </button>
      {hasFilters && (
        <Link href={kept.length > 0 ? `${basePath}?${new URLSearchParams(kept).toString()}` : basePath} className={`${TEXT_LINK} justify-center tab:self-center`}>
          Réinitialiser
        </Link>
      )}
    </form>
  );
}
