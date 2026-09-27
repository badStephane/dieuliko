import type { LucideIcon } from "lucide-react";
import { Building2, PenLine, Send } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

interface Benefit {
  readonly title: string;
  readonly text: string;
  readonly Icon: LucideIcon;
}

const BENEFITS: readonly Benefit[] = [
  {
    title: "Un annuaire d'entreprises",
    text: "Parcourez les entreprises du Sénégal par secteur ou par ville et repérez celles qui vous correspondent.",
    Icon: Building2,
  },
  {
    title: "La candidature spontanée",
    text: "Proposez votre profil directement à l'entreprise de votre choix, même quand aucune offre n'est publiée.",
    Icon: Send,
  },
  {
    title: "Une lettre rédigée avec l'IA",
    text: "Obtenez une lettre de motivation adaptée à chaque entreprise, que vous relisez et ajustez avant l'envoi.",
    Icon: PenLine,
  },
];

const STAGGER_MS = 100;

function BenefitCard({ benefit }: { readonly benefit: Benefit }) {
  const { Icon } = benefit;
  return (
    <article className="group flex h-full flex-col rounded-[6px] bg-white p-6 transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(17,24,39,0.25)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 desk:p-8">
      <span className="flex size-16 items-center justify-center rounded-[4px] bg-accent-soft transition-colors duration-300 group-hover:bg-primary">
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className="size-[30px] text-primary transition-colors duration-300 group-hover:text-white"
        />
      </span>
      <h3 className="mt-6 text-[24px] leading-9 font-semibold text-ink">{benefit.title}</h3>
      <p className="mt-2 text-[18px] leading-[27px] text-ink-deep">{benefit.text}</p>
    </article>
  );
}

/** « Pourquoi Dieuliko » — value proposition in three cards. */
export function BenefitsSection() {
  return (
    <section className="bg-surface py-[60px] tab:py-20 desk:py-[120px]">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="Pourquoi Dieuliko" title="Candidater autrement" align="center" />
        </Reveal>
        <ul className="mt-10 grid grid-cols-1 gap-5 tab:mt-[46px] tab:grid-cols-3 tab:gap-5 desk:mt-14 desk:gap-6">
          {BENEFITS.map((benefit, index) => (
            <li key={benefit.title}>
              <Reveal delay={index * STAGGER_MS} className="h-full">
                <BenefitCard benefit={benefit} />
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
