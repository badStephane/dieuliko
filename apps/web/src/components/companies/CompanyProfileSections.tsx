import { ArrowRight, Navigation } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Company } from "@/features/companies/company";
import { buildCompanySummary, directionsUrl, formatCompanyType, formatRating, safeWebsiteUrl, SIZE_LABELS, telHref } from "@/features/companies/profile";
import { formatNumber } from "@/lib/format";
import { directoryHref } from "@/features/companies/search-params";
import { getSectorLabel } from "@/features/companies/sectors";
import { COMPANY_SPACE_PATH } from "@/lib/navigation";

const LINK_CLASSES =
  "font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function ProfileSection({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-[28px] leading-[1.2] font-bold tab:text-[36px] desk:text-[40px]">
        {title}
      </h2>
      <div className="mt-5 text-[18px] leading-[28px] text-ink-deep tab:mt-[30px] tab:text-[20px] tab:leading-[30px]">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-4 first:pt-0 last:border-b-0 tab:grid-cols-[220px_minmax(0,1fr)] tab:gap-6">
      <dt className="font-semibold text-ink">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

interface CompanyProfileSectionsProps {
  readonly company: Company;
  /** Number of listed companies in the same sector. */
  readonly sectorCount: number;
}

/** « À propos », « Secteur d'activité » and « Infos pratiques », stacked in one column. */
export function CompanyProfileSections({ company, sectorCount }: CompanyProfileSectionsProps) {
  const type = formatCompanyType(company.companyType);
  const rating = formatRating(company.rating, company.ratingCount);
  const sectorLabel = getSectorLabel(company.sector);
  const website = safeWebsiteUrl(company.website);

  return (
    <div className="flex flex-col gap-12 tab:gap-[60px] desk:gap-[78px]">
      <ProfileSection id="a-propos" title="À propos">
        <div className="flex flex-col gap-4">
          {buildCompanySummary(company).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <p className="mt-6 rounded-[6px] bg-surface px-5 py-4 text-[16px] leading-[24px] text-muted">
          Fiche créée à partir d’informations publiques. Vous représentez {company.name} ?{" "}
          <Link href={COMPANY_SPACE_PATH} className={LINK_CLASSES}>
            Complétez-la depuis l’espace entreprise
          </Link>
          .
        </p>
      </ProfileSection>

      <ProfileSection id="secteur" title="Secteur d’activité">
        <dl>
          <Fact label="Secteur">
            {sectorLabel}
            <Link href={directoryHref({ sector: company.sector })} className={`mt-1 flex items-center gap-1.5 text-[16px] leading-[24px] ${LINK_CLASSES}`}>
              Voir les {formatNumber(sectorCount)} entreprises du secteur
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Fact>
          {type && <Fact label="Type d’établissement">{type}</Fact>}
          {company.size && <Fact label="Taille">{SIZE_LABELS[company.size]}</Fact>}
        </dl>
      </ProfileSection>

      <ProfileSection id="infos-pratiques" title="Infos pratiques">
        <dl>
          <Fact label="Ville">{company.city}</Fact>
          {company.address && (
            <Fact label="Adresse">
              <address className="not-italic">{company.address}</address>
              <a
                href={directionsUrl(company.address)}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-1 inline-flex items-center gap-1.5 text-[16px] leading-[24px] ${LINK_CLASSES}`}
              >
                <Navigation aria-hidden className="size-4" />
                Itinéraire
                <span className="sr-only"> vers {company.name} (Google Maps, nouvel onglet)</span>
              </a>
            </Fact>
          )}
          {company.phone && (
            <Fact label="Téléphone">
              <a href={telHref(company.phone)} className={LINK_CLASSES}>
                {company.phone}
              </a>
            </Fact>
          )}
          {company.email && (
            <Fact label="E-mail">
              <a href={`mailto:${company.email}`} className={LINK_CLASSES}>
                {company.email}
              </a>
            </Fact>
          )}
          {website && (
            <Fact label="Site web">
              <a href={website} target="_blank" rel="noopener noreferrer nofollow" className={LINK_CLASSES}>
                {new URL(website).hostname}
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            </Fact>
          )}
          {rating && <Fact label="Note Google">{rating}</Fact>}
        </dl>
      </ProfileSection>
    </div>
  );
}
