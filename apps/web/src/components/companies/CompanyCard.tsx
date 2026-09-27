import { Briefcase, MapPin, Star } from "lucide-react";
import Link from "next/link";
import type { Company } from "@/features/companies/company";
import { formatCompanyType, SIZE_LABELS } from "@/features/companies/profile";
import { formatNumber } from "@/lib/format";
import { companyHref } from "@/features/companies/search-params";
import { getSectorLabel } from "@/features/companies/sectors";
import { CompanyAvatar } from "./CompanyAvatar";

const BADGE_CLASSES = "inline-flex h-[30px] items-center rounded-[2px] px-2 text-[16px] leading-[24px] font-medium";

function TopBadges({ company }: { readonly company: Company }) {
  const isRecruiting = company.acceptsSpontaneous === true;
  return (
    <div className="flex min-h-[30px] items-start justify-between gap-3">
      {company.size ? (
        <span className={`${BADGE_CLASSES} bg-accent-soft text-primary-deep`}>{SIZE_LABELS[company.size]}</span>
      ) : (
        <span />
      )}
      {isRecruiting && <span className={`${BADGE_CLASSES} bg-primary text-white`}>Recrute activement</span>}
      {!isRecruiting && company.rating !== null && (
        <span className={`${BADGE_CLASSES} gap-1 bg-soft text-ink`}>
          <Star aria-hidden className="size-4 fill-star text-star" />
          <span className="sr-only">Note Google : </span>
          {formatNumber(company.rating)}
          <span className="sr-only"> sur 5</span>
        </span>
      )}
    </div>
  );
}

/**
 * Directory tile (adapted from the BestJob job card): size/recruiting badges, monogram, name,
 * type, then sector and city. Fluid width: the parent grid or carousel sets its size.
 */
export function CompanyCard({ company }: { readonly company: Company }) {
  const type = formatCompanyType(company.companyType);

  return (
    <Link
      href={companyHref(company.slug)}
      className="group flex h-full w-full flex-col rounded-[6px] border border-line bg-white p-5 transition-[border-color,box-shadow,translate] duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_24px_48px_-24px_rgba(17,24,39,0.25)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0 tab:p-[25px]"
    >
      <TopBadges company={company} />
      <CompanyAvatar company={company} className="mx-auto transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100" />
      <h3 className="mt-6 line-clamp-2 text-center text-[22px] leading-[1.4] font-semibold break-words transition-colors duration-300 group-hover:text-primary desk:text-[24px]">
        {company.name}
      </h3>
      {type && <p className="mt-1 text-center text-[16px] leading-[24px] text-muted">{type}</p>}
      <div className="mt-auto pt-6">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 border-t border-line pt-5 text-[16px] leading-[24px] text-ink-deep">
          <div className="min-w-0">
            <dt className="sr-only">Secteur</dt>
            <dd className="flex items-start gap-2">
              <Briefcase aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.5} />
              {getSectorLabel(company.sector)}
            </dd>
          </div>
          <div>
            <dt className="sr-only">Ville</dt>
            <dd className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.5} />
              {company.city}
            </dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
