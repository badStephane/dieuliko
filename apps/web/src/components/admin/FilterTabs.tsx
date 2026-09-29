import Link from "next/link";
import type { StatusOption } from "./ListSearchForm";
import { FOCUS_RING } from "./styles";

interface FilterTabsProps {
  readonly label: string;
  readonly options: readonly StatusOption[];
  /** The option's value in the URL ("" for everything). */
  readonly current: string;
  readonly hrefFor: (value: string) => string;
}

/** A row of pill links narrowing a back-office list; it scrolls sideways on phones rather than wrapping. */
export function FilterTabs({ label, options, current, hrefFor }: FilterTabsProps) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto">
      <ul className="flex gap-2 px-1 pb-1">
        {options.map((option) => {
          const isCurrent = option.value === current;
          return (
            <li key={option.value} className="shrink-0">
              <Link
                href={hrefFor(option.value)}
                aria-current={isCurrent ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-semibold transition-colors duration-150 ${FOCUS_RING} ${
                  isCurrent ? "bg-ink text-white" : "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"
                }`}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
