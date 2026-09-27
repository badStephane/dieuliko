import { MapPin, Star } from "lucide-react";
import { CompanyAvatar } from "@/components/companies/CompanyAvatar";
import { companyHref } from "@/features/companies/search-params";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import type { Company } from "@/features/companies/company";
import { formatCompanyType, formatRating, SIZE_LABELS } from "@/features/companies/profile";
import { getSectorLabel } from "@/features/companies/sectors";
import { COMPANIES_PATH } from "@/lib/navigation";
import { SectorIcon } from "./SectorIcon";

const CHIP_CLASSES =
  "inline-flex h-9 items-center gap-2 rounded-full border border-line bg-white px-3.5 text-[16px] leading-6 text-ink-deep";

function CompanyFacts({ company }: { readonly company: Company }) {
  const type = formatCompanyType(company.companyType);
  return (
    <ul className="mt-6 flex flex-wrap gap-2.5" aria-label="Informations clés">
      <li className={CHIP_CLASSES}>
        <SectorIcon sector={company.sector} className="size-4 text-primary" />
        {getSectorLabel(company.sector)}
      </li>
      <li className={CHIP_CLASSES}>
        <MapPin aria-hidden className="size-4 text-primary" strokeWidth={1.75} />
        {company.city}
      </li>
      {type && <li className={CHIP_CLASSES}>{type}</li>}
      {company.size && <li className={CHIP_CLASSES}>{SIZE_LABELS[company.size]}</li>}
    </ul>
  );
}

function RatingLine({ company }: { readonly company: Company }) {
  const rating = formatRating(company.rating, company.ratingCount);
  if (!rating) return null;
  return (
    <p className="mt-5 flex items-center gap-2 text-[18px] leading-[27px] font-semibold text-ink">
      <Star aria-hidden className="size-5 fill-star text-star" />
      <span>
        <span className="sr-only">Note Google : </span>
        {rating}
      </span>
    </p>
  );
}

/**
 * « Entreprise à la une » — the most-reviewed company of the directory (Google reviews):
 * a deterministic pick, with only facts taken from the data.
 */
export function FeaturedCompanySection({ company }: { readonly company: Company | null }) {
  if (!company) return null;
  return (
    <section aria-labelledby="featured-company-title" className="bg-white pt-[60px] tab:pt-20 desk:pt-[120px]">
      <Container>
        <Reveal className="group relative flex flex-col gap-8 overflow-hidden rounded-[6px] bg-soft p-6 tab:flex-row tab:items-center tab:gap-10 tab:p-10 desk:gap-16 desk:px-16 desk:py-14">
          <span aria-hidden className="absolute top-0 left-0 h-full w-1.5 bg-primary" />
          <CompanyAvatar
            company={company}
            size="lg"
            className="transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100 desk:size-[180px] desk:text-[60px]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[18px] leading-[27px] font-bold tracking-[0.04em] text-primary-deep uppercase">
              Entreprise à la une
            </p>
            <h2
              id="featured-company-title"
              className="mt-1 text-[32px] leading-[1.2] font-bold break-words text-ink tab:text-[40px] desk:text-[48px]"
            >
              {company.name}
            </h2>
            <p className="mt-3 text-[16px] leading-6 text-muted">
              L&apos;entreprise la plus évaluée de l&apos;annuaire sur Google.
            </p>
            <CompanyFacts company={company} />
            <RatingLine company={company} />
          </div>
          <div className="flex shrink-0 flex-col gap-3 tab:self-end desk:self-center">
            <ButtonLink href={companyHref(company.slug)}>Voir la fiche</ButtonLink>
            <ButtonLink href={COMPANIES_PATH} variant="light" className="border border-line">
              Tout l&apos;annuaire
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
