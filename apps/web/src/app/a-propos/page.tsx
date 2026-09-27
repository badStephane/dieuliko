import type { Metadata } from "next";
import { AboutCompanySection } from "@/components/about/AboutCompanySection";
import { AboutHero } from "@/components/about/AboutHero";
import { CareerCtaSection } from "@/components/sections/CareerCtaSection";
import { ProcessSection } from "@/components/sections/ProcessSection";
import { getDirectoryStats } from "@/features/about/directory-stats";
import { getCompanyRepository } from "@/features/companies/source";

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Dieuliko aide les candidats au Sénégal à envoyer des candidatures spontanées aux entreprises du pays, avec l’aide de l’IA pour le CV et la lettre de motivation.",
};

export default async function AboutPage() {
  const stats = await getDirectoryStats(await getCompanyRepository());
  return (
    <>
      <AboutHero />
      <AboutCompanySection stats={stats} />
      <ProcessSection tone="white" variant="about" />
      <CareerCtaSection withArrow={false} variant="about" />
    </>
  );
}
