import type { Metadata } from "next";
import { BenefitsSection } from "@/components/home/BenefitsSection";
import { CategorySection } from "@/components/home/CategorySection";
import { CompanyCarousel } from "@/components/home/CompanyCarousel";
import { FeaturedCompanySection } from "@/components/home/FeaturedCompanySection";
import { HomeAbout } from "@/components/home/HomeAbout";
import { HomeHero } from "@/components/home/HomeHero";
import { CareerCtaSection } from "@/components/sections/CareerCtaSection";
import { ProcessSection } from "@/components/sections/ProcessSection";
import { SITE } from "@/config/site";
import { getCompanyRepository } from "@/features/companies/json-source";
import { getHomeData } from "@/features/home/home-data";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} — ${SITE.tagline}` },
  description: SITE.description,
};

/** Hero bubbles show four sectors; the search shortcuts use the first three. */
const HERO_SECTOR_COUNT = 4;

export default async function HomePage() {
  const data = await getHomeData(await getCompanyRepository(), { topSectorCount: HERO_SECTOR_COUNT });

  return (
    <>
      <HomeHero companyCount={data.stats.companyCount} topSectors={data.topSectors.map(({ sector }) => sector)} />
      <FeaturedCompanySection company={data.featured} />
      <CategorySection sectors={data.sectors} />
      <BenefitsSection />
      <HomeAbout stats={data.stats} />
      <CompanyCarousel companies={data.highlights} />
      <ProcessSection tone="surface" />
      <CareerCtaSection />
    </>
  );
}
