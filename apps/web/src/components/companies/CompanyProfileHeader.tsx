import { Briefcase, MapPin, Star, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { Company } from "@/features/companies/company";
import { formatCompanyType, formatRating, SIZE_LABELS } from "@/features/companies/profile";
import { getSectorLabel } from "@/features/companies/sectors";
import { CompanyAvatar } from "./CompanyAvatar";

function Chip({ icon, children }: { readonly icon: ReactNode; readonly children: ReactNode }) {
  return (
    <li className="inline-flex min-h-9 items-center gap-1.5 rounded-[4px] bg-accent-soft px-3 py-1.5 text-[16px] leading-[24px] text-ink">
      {icon}
      {children}
    </li>
  );
}

const ICON_CLASSES = "size-5 shrink-0 text-primary-deep";

/** White card overlapping the banner edge (old job header): avatar, type, sector, city, size, rating. */
export function CompanyProfileHeader({ company }: { readonly company: Company }) {
  const type = formatCompanyType(company.companyType);
  const rating = formatRating(company.rating, company.ratingCount);

  return (
    <div className="relative z-10 px-5 pb-10 tab:-mb-[90px] tab:px-[30px] tab:pb-0">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 rounded-[6px] bg-white p-5 shadow-[-9px_31px_52px_-19px_rgba(17,24,39,0.25)] tab:flex-row tab:items-center tab:gap-10 tab:p-10 desk:px-[94px] desk:py-[57px]">
        <CompanyAvatar company={company} size="lg" className="self-center tab:self-auto" />
        <div className="min-w-0">
          <p className="text-[18px] leading-[27px] text-ink-deep">{type ? "Type d’établissement" : "Secteur d’activité"}</p>
          <p className="font-heading text-[36px] leading-[1.2] font-bold text-ink tab:text-[45px] desk:text-[56px]">
            {type ?? getSectorLabel(company.sector)}
          </p>
          <ul aria-label="En bref" className="mt-4 flex flex-wrap gap-2.5">
            <Chip icon={<Briefcase aria-hidden className={ICON_CLASSES} strokeWidth={1.5} />}>{getSectorLabel(company.sector)}</Chip>
            <Chip icon={<MapPin aria-hidden className={ICON_CLASSES} strokeWidth={1.5} />}>{company.city}</Chip>
            {company.size && (
              <Chip icon={<Users aria-hidden className={ICON_CLASSES} strokeWidth={1.5} />}>{SIZE_LABELS[company.size]}</Chip>
            )}
            {rating && <Chip icon={<Star aria-hidden className="size-5 shrink-0 fill-star text-star" />}>{rating}</Chip>}
          </ul>
        </div>
      </div>
    </div>
  );
}
