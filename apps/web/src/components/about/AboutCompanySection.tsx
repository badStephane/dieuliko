import Image from "next/image";
import { Building2, Send, Sparkles, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SITE } from "@/config/site";
import type { DirectoryStats } from "@/features/about/directory-stats";
import { formatNumber } from "@/lib/format";

interface Feature {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

interface Counter {
  readonly value: number;
  readonly label: string;
}

const FEATURES: readonly Feature[] = [
  {
    title: "Des entreprises réelles",
    description: "Un annuaire d’entreprises sénégalaises existantes, classées par secteur et par ville.",
    icon: Building2,
  },
  {
    title: "La candidature spontanée",
    description: "Proposez votre profil directement aux entreprises, sans attendre qu’une offre paraisse.",
    icon: Send,
  },
  {
    title: "L’IA à vos côtés",
    description: "Une aide à la rédaction pour adapter votre CV et votre lettre de motivation à chaque entreprise.",
    icon: Sparkles,
  },
];

function FeatureList() {
  return (
    <ul className="flex flex-col gap-[30px] tab:gap-12 desk:w-[350px] desk:shrink-0 desk:gap-12">
      {FEATURES.map((feature) => {
        const Icon = feature.icon;
        return (
          <li key={feature.title} className="flex items-center gap-[26px]">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-[4px] bg-soft text-primary">
              <Icon aria-hidden className="size-[34px]" strokeWidth={1.25} />
            </span>
            <div>
              <h3 className="text-[24px] leading-9 font-semibold">{feature.title}</h3>
              <p className="mt-2 text-[16px] leading-6 text-ink-deep">{feature.description}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CompanyImage() {
  return (
    <div className="relative h-[461px] w-full overflow-hidden rounded-[4px] tab:h-auto tab:aspect-[346/461] desk:aspect-auto desk:h-[461px] desk:w-[346px] desk:shrink-0">
      <Image
        src="/images/BvM3IhLdLtLgbgXP1Z8mREPpqEg.png"
        alt="Un jeune homme sourit en travaillant sur son ordinateur portable, un drapeau du Sénégal au mur"
        fill
        sizes="(min-width: 1200px) 346px, 100vw"
        className="object-cover"
      />
      <p className="absolute bottom-6 left-6 rounded-[4px] bg-white px-5 py-3 font-heading text-[18px] leading-[27px] font-bold text-ink shadow-sm">
        {SITE.tagline}
      </p>
    </div>
  );
}

function CounterList({ stats }: { readonly stats: DirectoryStats }) {
  const counters: readonly Counter[] = [
    { value: stats.companies, label: "Entreprises référencées" },
    { value: stats.sectors, label: "Secteurs d’activité" },
    { value: stats.cities, label: "Villes représentées" },
  ];
  return (
    <dl className="mt-6 grid grid-cols-1 gap-4 tab:grid-cols-3 tab:gap-6 desk:gap-4">
      {counters.map((counter) => (
        <div key={counter.label} className="flex items-center gap-4 tab:flex-col tab:items-start tab:gap-1">
          <dt className="order-last text-[16px] leading-6 font-medium text-ink-deep">{counter.label}</dt>
          <dd className="min-w-[110px] font-heading tab:min-w-0 text-[36px] leading-[1.1] font-bold text-ink tab:text-[40px] desk:text-[44px]">
            {formatNumber(counter.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface AboutCompanySectionProps {
  readonly stats: DirectoryStats;
}

/** "Notre mission": 3 features, portrait with the tagline, mission text and real directory figures. */
export function AboutCompanySection({ stats }: AboutCompanySectionProps) {
  return (
    <section className="bg-white pt-[60px] pb-[30px] tab:pt-20 tab:pb-20 desk:pt-[524px] desk:pb-[120px]">
      <Container>
        <Reveal className="flex flex-col gap-10 tab:gap-[50px] desk:flex-row desk:items-center desk:gap-10">
          <div className="flex flex-col desk:order-last desk:w-[424px] desk:shrink-0">
            <SectionHeading eyebrow="Notre mission" title="Osez frapper à la porte" />
            <p className="mt-6 text-[18px] leading-[27px] text-muted">
              Au Sénégal, beaucoup de recrutements se font sans annonce. Dieuliko vous donne accès aux entreprises
              du pays et vous aide à leur envoyer une candidature spontanée soignée, avec un CV et une lettre de
              motivation adaptés.
            </p>
            <CounterList stats={stats} />
          </div>
          <FeatureList />
          <CompanyImage />
        </Reveal>
      </Container>
    </section>
  );
}
