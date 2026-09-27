import { CompanyCard } from "@/components/companies/CompanyCard";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { Company } from "@/features/companies/company";
import { LoopSlider } from "./LoopSlider";

/** « Entreprises à la une » — looping slider of the leading company of each sector. */
export function CompanyCarousel({ companies }: { readonly companies: readonly Company[] }) {
  if (companies.length === 0) return null;
  const slides = companies.map((company) => ({ key: company.slug, content: <CompanyCard company={company} /> }));

  return (
    <section className="bg-soft pt-[60px] pb-[49px] tab:py-20 desk:pt-[120px] desk:pb-[126px]">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="Une entreprise par secteur" title="Entreprises à la une" align="center" />
        </Reveal>
        <Reveal delay={100} className="mt-[42px] tab:mt-[60px] desk:mt-[61px]">
          <LoopSlider
            slides={slides}
            label="Entreprises à la une"
            previousLabel="Entreprise précédente"
            nextLabel="Entreprise suivante"
          />
        </Reveal>
      </Container>
    </section>
  );
}
