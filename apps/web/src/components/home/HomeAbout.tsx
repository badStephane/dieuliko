import Image from "next/image";
import { Fragment } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { HomeStats } from "@/features/home/home-data";
import { formatNumber } from "@/lib/format";

interface Counter {
  readonly value: string;
  readonly label: string;
}

function toCounters(stats: HomeStats): readonly Counter[] {
  return [
    { value: formatNumber(stats.companyCount), label: "entreprises référencées" },
    { value: formatNumber(stats.sectorCount), label: "secteurs d'activité" },
    { value: formatNumber(stats.cityCount), label: "villes couvertes" },
  ];
}

function CounterItem({ counter }: { readonly counter: Counter }) {
  return (
    <div className="flex items-center gap-4 tab:flex-1 tab:flex-col tab:items-start tab:gap-1">
      <dd className="font-heading text-[36px] leading-[1.1] font-bold text-ink tab:text-[45px] tab:leading-[1.2] desk:text-[52px]">
        {counter.value}
      </dd>
      <dt className="text-[18px] leading-[27px] font-medium text-ink-deep">{counter.label}</dt>
    </div>
  );
}

function AboutText({ stats }: { readonly stats: HomeStats }) {
  return (
    <div className="flex flex-col items-start desk:w-[560px] desk:shrink-0">
      <SectionHeading eyebrow="À propos de Dieuliko" title="L'emploi au Sénégal commence par les entreprises" />
      <p className="mt-6 text-[18px] leading-[27px] text-ink-deep/90">
        Beaucoup de postes ne sont jamais publiés. Dieuliko rassemble les entreprises du pays dans un annuaire clair
        pour que vous puissiez les contacter directement, avec une candidature soignée.
      </p>
      <dl className="mt-8 flex w-full flex-col gap-4 tab:flex-row tab:items-center tab:gap-6">
        {toCounters(stats).map((counter, index) => (
          <Fragment key={counter.label}>
            {index > 0 && <span aria-hidden className="hidden h-16 w-px shrink-0 bg-line tab:block" />}
            <CounterItem counter={counter} />
          </Fragment>
        ))}
      </dl>
      <ButtonLink href="/a-propos" className="mt-8 tab:mt-10">
        En savoir plus
      </ButtonLink>
    </div>
  );
}

function AboutPhoto() {
  return (
    <div className="relative mt-10 aspect-[350/400] w-full overflow-hidden rounded-[4px] tab:mt-[50px] tab:aspect-[940/700] desk:mt-0 desk:aspect-auto desk:h-[520px] desk:flex-1">
      <Image
        src="/images/BvM3IhLdLtLgbgXP1Z8mREPpqEg.png"
        alt="Jeune femme souriante travaillant sur un ordinateur portable"
        fill
        sizes="(min-width: 1200px) 560px, 100vw"
        className="object-cover"
      />
      <p className="absolute bottom-[15px] left-[15px] rounded-[4px] bg-white px-4 py-3 tab:bottom-6 tab:left-6 tab:px-5 tab:py-4">
        <span className="block font-heading text-[28px] leading-[1.2] font-bold text-primary tab:text-[36px]">
          100&nbsp;% Sénégal
        </span>
        <span className="text-[16px] leading-6 text-ink-deep">de Dakar à Ziguinchor</span>
      </p>
    </div>
  );
}

/** « À propos » — mission text with real directory figures, next to a photo. */
export function HomeAbout({ stats }: { readonly stats: HomeStats }) {
  return (
    <section className="bg-white py-[60px] tab:py-20 desk:py-[120px]">
      <Container>
        <Reveal className="flex flex-col desk:flex-row desk:items-center desk:gap-16">
          <AboutText stats={stats} />
          <AboutPhoto />
        </Reveal>
      </Container>
    </section>
  );
}
