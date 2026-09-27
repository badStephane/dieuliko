import { Building2, Search, Sparkles, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ContactForm } from "./ContactForm";

interface Topic {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

const TOPICS: readonly Topic[] = [
  {
    title: "Candidats",
    description: "Une question sur la candidature spontanée, votre futur compte ou l’aide à la rédaction du CV.",
    icon: Search,
  },
  {
    title: "Entreprises",
    description: "Votre entreprise figure dans l’annuaire, une information est à corriger, ou vous souhaitez y apparaître.",
    icon: Building2,
  },
  {
    title: "Idées et partenariats",
    description: "Une suggestion pour améliorer Dieuliko ou une envie de collaborer : nous lisons tout.",
    icon: Sparkles,
  },
];

function TopicsPanel() {
  return (
    <div className="flex flex-col rounded-[6px] bg-white p-[30px] tab:p-10">
      <h3 className="text-[24px] leading-9 font-semibold">Pourquoi nous écrire ?</h3>
      <ul className="mt-6 flex flex-col gap-6">
        {TOPICS.map((topic) => {
          const Icon = topic.icon;
          return (
            <li key={topic.title} className="flex gap-5">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-[4px] bg-accent-soft text-primary">
                <Icon aria-hidden className="size-6" strokeWidth={1.5} />
              </span>
              <div>
                <p className="text-[18px] leading-[27px] font-semibold text-ink">{topic.title}</p>
                <p className="mt-1 text-[16px] leading-6 text-ink-deep">{topic.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Grey section: form on the left, topics panel on the right (stacked below 1200px). The template's map
 * was removed: Dieuliko has no public office address, so a pin would suggest one that does not exist.
 */
export function ContactFormSection() {
  return (
    <section className="bg-soft py-[60px] tab:py-20 desk:py-[120px]">
      <Container className="flex flex-col gap-[30px] tab:gap-10 desk:flex-row">
        <Reveal className="desk:w-[610px] desk:shrink-0">
          <SectionHeading eyebrow="Écrivez-nous" title="Parlons-en" className="mb-12" />
          <ContactForm />
        </Reveal>
        <Reveal delay={100} className="desk:flex-1">
          <TopicsPanel />
        </Reveal>
      </Container>
    </section>
  );
}
