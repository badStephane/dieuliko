import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CompanyProfileHeader } from "@/components/companies/CompanyProfileHeader";
import { CompanyProfileSections } from "@/components/companies/CompanyProfileSections";
import { CompanyProfileSidebar } from "@/components/companies/CompanyProfileSidebar";
import { SimilarCompanies } from "@/components/companies/SimilarCompanies";
import { SpontaneousApplicationCta } from "@/components/companies/SpontaneousApplicationCta";
import { PageBanner } from "@/components/layout/PageBanner";
import { Container } from "@/components/ui/Container";
import type { Company } from "@/features/companies/company";
import { getCompanyRepository } from "@/features/companies/json-source";
import { buildCompanySummary, rankSimilarCompanies } from "@/features/companies/profile";
import { companyHref } from "@/features/companies/search-params";
import { getSectorLabel } from "@/features/companies/sectors";

/**
 * Rendering strategy: ~1,900 profiles are not prebuilt (that would slow every build for pages
 * rarely visited). Each profile is rendered on its first visit, then served statically (ISR)
 * and refreshed daily — the directory data changes rarely. Unknown slugs render the 404 page.
 */
export const revalidate = 86400;
const SIMILAR_COUNT = 3;
/** Same-sector candidates scanned to find those in the same city. */
const SIMILAR_POOL = 60;
const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

/** Shared by `generateMetadata` and the page within one request. */
const findCompany = cache(async (slug: string): Promise<Company | null> => {
  if (!SLUG_PATTERN.test(slug)) return null;
  const repository = await getCompanyRepository();
  return repository.findBySlug(slug);
});

export async function generateMetadata({ params }: PageProps<"/entreprises/[slug]">): Promise<Metadata> {
  const company = await findCompany((await params).slug);
  if (!company) return { title: "Entreprise introuvable" };
  const description = buildCompanySummary(company).slice(0, 2).join(" ");
  return {
    title: `${company.name} — ${getSectorLabel(company.sector)} à ${company.city}`,
    description,
    alternates: { canonical: companyHref(company.slug) },
    openGraph: { title: company.name, description, type: "profile" },
  };
}

function organizationJsonLd(company: Company): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company.name,
    url: companyHref(company.slug),
    ...(company.phone ? { telephone: company.phone } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: company.city,
      addressCountry: "SN",
      ...(company.address ? { streetAddress: company.address } : {}),
    },
  };
  // Escape "<" so scraped text can never close the <script> element.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function CompanyProfilePage({ params }: PageProps<"/entreprises/[slug]">) {
  const company = await findCompany((await params).slug);
  if (!company) notFound();

  const repository = await getCompanyRepository();
  const { items: sameSector, total: sectorCount } = await repository.search(
    { sector: company.sector },
    { offset: 0, limit: SIMILAR_POOL },
  );
  const similar = rankSimilarCompanies(company, sameSector, SIMILAR_COUNT);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationJsonLd(company) }} />
      <PageBanner
        title={company.name}
        subtitle={`${getSectorLabel(company.sector)} · ${company.city}`}
        bottomPaddingClassName="pb-8 tab:pb-[60px] desk:pb-[88px]"
        className="[&_h1]:break-words"
      >
        <CompanyProfileHeader company={company} />
      </PageBanner>
      <div className="bg-white pt-[60px] pb-[60px] tab:pt-[150px] tab:pb-20 desk:pt-[178px] desk:pb-[120px]">
        <Container className="grid grid-cols-1 items-start gap-12 desk:grid-cols-[minmax(0,1fr)_396px] desk:gap-[70px]">
          <div className="flex min-w-0 flex-col gap-12 tab:gap-[60px] desk:gap-[78px]">
            <CompanyProfileSections company={company} sectorCount={sectorCount} />
            <SpontaneousApplicationCta name={company.name} slug={company.slug} />
          </div>
          <aside aria-label={`Résumé : ${company.name}`} className="desk:sticky desk:top-8">
            <CompanyProfileSidebar company={company} />
          </aside>
        </Container>
      </div>
      <SimilarCompanies sector={company.sector} companies={similar} />
    </>
  );
}
