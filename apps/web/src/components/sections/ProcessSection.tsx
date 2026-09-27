import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { Building2, ListChecks, Send, UserRound } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import styles from "./decorations.module.css";

interface ProcessStep {
  readonly number: string;
  readonly title: string;
  readonly description: string;
  readonly Icon: LucideIcon;
  /** Desktop only: steps 2 and 4 sit 40px lower (zig-zag). */
  readonly isLowered: boolean;
}

const STEPS: readonly ProcessStep[] = [
  {
    number: "01",
    title: "Créer votre profil",
    description: "Renseignez votre parcours et ajoutez votre CV en quelques minutes.",
    Icon: UserRound,
    isLowered: false,
  },
  {
    number: "02",
    title: "Choisir une entreprise",
    description: "Explorez l'annuaire par secteur ou par ville et trouvez la bonne cible.",
    Icon: Building2,
    isLowered: true,
  },
  {
    number: "03",
    title: "Envoyer une candidature spontanée",
    description: "Joignez une lettre de motivation adaptée, rédigée avec l'aide de l'IA.",
    Icon: Send,
    isLowered: false,
  },
  {
    number: "04",
    title: "Suivre vos candidatures",
    description: "Retrouvez toutes vos démarches au même endroit et relancez au bon moment.",
    Icon: ListChecks,
    isLowered: true,
  },
];

interface ArrowPlacement {
  readonly left: number;
  readonly top: number;
  readonly rotate: number;
}

/** Hand-drawn arrows between steps (desktop only), positions measured at 1440px. */
const ARROWS: readonly ArrowPlacement[] = [
  { left: 256, top: 28, rotate: 15 },
  { left: 553, top: 51, rotate: -44 },
  { left: 864, top: 49, rotate: -2 },
];

const ARROW_SRC = "/images/FTidIDIuaqJUXd2F8Ce92IQaWxs.svg";

type ProcessTone = "surface" | "white";

/** Section background and the contrasting step disc colour. */
const TONE_CLASSES: Record<ProcessTone, { section: string; disc: string }> = {
  surface: { section: "bg-surface", disc: "bg-white" },
  white: { section: "bg-white", disc: "bg-soft" },
};

type ProcessVariant = "home" | "about";

/** Spacing differs slightly between the two pages on the original (mobile top padding, tablet row gap). */
const VARIANT_CLASSES: Record<ProcessVariant, { section: string; list: string }> = {
  home: { section: "pt-[60px]", list: "tab:gap-y-16" },
  about: { section: "pt-[30px]", list: "tab:gap-y-10" },
};

interface ProcessSectionProps {
  /** Home uses the light surface background, About uses white. */
  readonly tone?: ProcessTone;
  /** Page-specific spacing: "home" (default) or "about". */
  readonly variant?: ProcessVariant;
}

function Step({ step, discClass }: { readonly step: ProcessStep; readonly discClass: string }) {
  const { Icon } = step;
  return (
    <li className={`flex flex-col items-center text-center ${step.isLowered ? "desk:mt-10" : ""}`}>
      <div
        className={`group relative flex size-24 items-center justify-center rounded-full ${discClass} transition-colors duration-300 hover:bg-accent-soft`}
      >
        <Icon
          aria-hidden
          strokeWidth={1.5}
          className="size-10 text-primary transition-transform duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100"
        />
        <span className="absolute top-0 left-[68px] flex size-[30px] items-center justify-center rounded-full bg-accent-soft text-[14px] leading-[21px] font-semibold text-ink">
          {step.number}
        </span>
      </div>
      <h3 className="mt-6 text-[24px] leading-9 font-semibold text-ink">{step.title}</h3>
      <p className="mt-2 max-w-[300px] text-[18px] leading-[27px] text-ink-deep">{step.description}</p>
    </li>
  );
}

/** « Comment ça marche » — 4 numbered steps with animated hand-drawn arrows. */
export function ProcessSection({ tone = "surface", variant = "home" }: ProcessSectionProps) {
  const spacing = VARIANT_CLASSES[variant];
  const colors = TONE_CLASSES[tone];
  return (
    <section className={`${colors.section} ${spacing.section} pb-[60px] tab:pt-20 tab:pb-[120px] desk:py-[120px]`}>
      <Container>
        <Reveal>
          <SectionHeading eyebrow="Comment ça marche" title="Candidater en 4 étapes" align="center" />
        </Reveal>
        <Reveal delay={100} className="relative mt-10 tab:mt-[47px] desk:mt-14">
          <ol
            className={`grid grid-cols-1 gap-10 tab:grid-cols-2 tab:gap-x-6 ${spacing.list} desk:grid-cols-4 desk:gap-x-2.5 desk:gap-y-0`}
          >
            {STEPS.map((step) => (
              <Step key={step.number} step={step} discClass={colors.disc} />
            ))}
          </ol>
          {ARROWS.map((arrow) => (
            <div
              key={arrow.left}
              aria-hidden
              className="pointer-events-none absolute hidden h-14 w-[94px] desk:block"
              style={{ left: arrow.left, top: arrow.top, rotate: `${arrow.rotate}deg` }}
            >
              <Image src={ARROW_SRC} alt="" fill sizes="94px" className={`object-contain ${styles.nudge}`} />
            </div>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
