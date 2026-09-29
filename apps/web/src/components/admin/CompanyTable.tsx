"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { BUTTON, Feedback, SECONDARY, type ActionFeedback } from "@/components/candidate/ActionControls";
import { CompanyAvatar } from "@/components/companies/CompanyAvatar";
import { bulkCompaniesAction } from "@/features/admin/actions";
import type { BulkAction, CompanySummary } from "@/features/admin/admin-api";
import { adminCompanyPath, adminLogoUrl } from "@/features/admin/paths";
import { getSectorLabel } from "@/features/companies/sectors";
import { formatDate } from "@/lib/format";
import { CompanyBadges } from "./CompanyBadges";

interface CompanyTableProps {
  readonly companies: readonly CompanySummary[];
}

const BULK_BUTTONS: readonly { readonly action: BulkAction; readonly label: string }[] = [
  { action: "verify", label: "Vérifier" },
  { action: "unverify", label: "Retirer la vérification" },
  { action: "hide", label: "Masquer" },
  { action: "unhide", label: "Afficher" },
];

const CHECKBOX = "size-5 cursor-pointer accent-primary";
const CELL = "px-3 py-3 align-middle";

/** Checkbox selecting every listing of the page; "mixed" while only some are. */
function SelectAll({ total, selected, onChange }: { readonly total: number; readonly selected: number; readonly onChange: (all: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && selected < total;
  }, [selected, total]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={total > 0 && selected === total}
      onChange={(event) => onChange(event.target.checked)}
      aria-label="Sélectionner toutes les fiches de la page"
      className={CHECKBOX}
    />
  );
}

/**
 * Listings of a back-office search: each opens its edit page, and the checked ones can be verified, hidden or shown
 * together. On phones the city and date move under the name.
 */
export function CompanyTable({ companies }: CompanyTableProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [result, setResult] = useState<ActionFeedback | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(slug: string, on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  function apply(action: BulkAction) {
    const slugs = [...selected];
    startTransition(async () => {
      const outcome = await bulkCompaniesAction(action, slugs);
      setResult(outcome);
      if (outcome.status === "success") setSelected(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Feedback result={result} />
      <div className="-mx-5 overflow-x-auto tab:-mx-8">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-[14px] leading-5 font-semibold text-muted">
              <th scope="col" className={`${CELL} w-12 pl-5 tab:pl-8`}>
                <SelectAll
                  total={companies.length}
                  selected={selected.size}
                  onChange={(all) => setSelected(new Set(all ? companies.map((company) => company.slug) : []))}
                />
              </th>
              <th scope="col" className={CELL}>
                Entreprise
              </th>
              <th scope="col" className={`${CELL} hidden tab:table-cell`}>
                Ville
              </th>
              <th scope="col" className={`${CELL} hidden desk:table-cell`}>
                Statut
              </th>
              <th scope="col" className={`${CELL} hidden pr-8 text-right tab:table-cell`}>
                Mise à jour
              </th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const isSelected = selected.has(company.slug);
              const logoUrl = company.logoVersion ? adminLogoUrl(company.slug, company.logoVersion) : null;
              return (
                <tr
                  key={company.slug}
                  className={`border-b border-line transition-colors duration-150 last:border-b-0 ${isSelected ? "bg-accent-soft/40" : "hover:bg-surface/70"}`}
                >
                  <td className={`${CELL} pl-5 tab:pl-8`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) => toggle(company.slug, event.target.checked)}
                      aria-label={`Sélectionner ${company.name}`}
                      className={CHECKBOX}
                    />
                  </td>
                  <td className={`${CELL} pr-5 tab:pr-3`}>
                    <Link href={adminCompanyPath(company.slug)} className="group flex min-h-12 items-center gap-3 focus-visible:outline-2 focus-visible:outline-primary">
                      <CompanyAvatar company={{ name: company.name, sector: company.sector, logoUrl }} size="sm" />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[16px] leading-6 font-semibold break-words text-ink underline-offset-4 group-hover:underline">{company.name}</span>
                        <span className="text-[14px] leading-5 text-muted">
                          {getSectorLabel(company.sector)}
                          <span className="tab:hidden"> · {company.city}</span>
                        </span>
                        <span className="desk:hidden">
                          <CompanyBadges company={company} />
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className={`${CELL} hidden text-[15px] text-ink-deep tab:table-cell`}>{company.city}</td>
                  <td className={`${CELL} hidden desk:table-cell`}>
                    <CompanyBadges company={company} />
                  </td>
                  <td className={`${CELL} hidden pr-8 text-right text-[14px] whitespace-nowrap text-muted tab:table-cell`}>{formatDate(company.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Actions sur la sélection"
          className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-[12px] bg-ink p-4 text-white shadow-[0_12px_32px_-12px_rgba(17,24,39,0.5)] tab:flex-row tab:items-center"
        >
          <p className="text-[16px] leading-6 font-semibold tab:mr-auto">
            {selected.size} {selected.size > 1 ? "fiches sélectionnées" : "fiche sélectionnée"}
          </p>
          <div className="flex flex-wrap gap-2">
            {BULK_BUTTONS.map(({ action, label }) => (
              <button key={action} type="button" disabled={isPending} onClick={() => apply(action)} className={`${BUTTON} min-h-11 bg-white/10 px-4 text-[15px] text-white hover:bg-white/20`}>
                {label}
              </button>
            ))}
            <button type="button" disabled={isPending} onClick={() => setSelected(new Set())} className={`${SECONDARY} min-h-11 px-4 text-[15px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)] hover:bg-white/10`}>
              Désélectionner
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
