import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { CompanySummary } from "@/features/admin/admin-api";
import { CompanyAvatar } from "@/components/companies/CompanyAvatar";
import { adminCompanyPath, adminLogoUrl } from "@/features/admin/paths";
import { getSectorLabel } from "@/features/companies/sectors";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

/** Badges telling what the team did with a listing. */
export function CompanyBadges({ company }: { readonly company: Pick<CompanySummary, "hiddenAt" | "verified" | "curatedAt"> }) {
  if (!company.hiddenAt && !company.verified && !company.curatedAt) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {company.hiddenAt && <StatusBadge tone="danger">Masquée</StatusBadge>}
      {company.verified && <StatusBadge tone="success">Vérifiée</StatusBadge>}
      {company.curatedAt && <StatusBadge tone="warning">Modifiée</StatusBadge>}
    </span>
  );
}

/** Listings found by a back-office search, each opening its edit page. */
export function CompanyList({ companies }: { readonly companies: readonly CompanySummary[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {companies.map((company) => (
        <li key={company.slug}>
          <Link
            href={adminCompanyPath(company.slug)}
            className="group flex min-h-16 items-center gap-4 py-4 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <CompanyAvatar
              company={{ name: company.name, sector: company.sector, logoUrl: company.logoVersion ? adminLogoUrl(company.slug, company.logoVersion) : null }}
              size="sm"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[17px] leading-[26px] font-semibold break-words text-ink underline-offset-4 group-hover:underline">{company.name}</span>
              <span className="text-[15px] leading-[22px] text-ink-deep">
                {getSectorLabel(company.sector)} · {company.city}
              </span>
              <CompanyBadges company={company} />
              <span className="text-[14px] leading-5 text-muted">Mise à jour le {formatDate(company.updatedAt)}</span>
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
