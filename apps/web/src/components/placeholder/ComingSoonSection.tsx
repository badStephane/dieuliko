import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

export interface ComingSoonItem {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

interface ComingSoonSectionProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: ReactNode;
  readonly items: readonly ComingSoonItem[];
  /** Buttons under the cards (links to pages that already exist). */
  readonly actions: ReactNode;
  /** Optional highlighted message above the intro (e.g. the company the candidate came from). */
  readonly highlight?: ReactNode;
}

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-1.5 text-[15px] leading-[22px] font-semibold text-ink">
      <span aria-hidden className="size-2 rounded-full bg-primary" />
      Bientôt disponible
    </span>
  );
}

/** Honest placeholder for features that are announced but not open yet (accounts, company space). */
export function ComingSoonSection({ eyebrow, title, intro, items, actions, highlight }: ComingSoonSectionProps) {
  return (
    <section className="bg-white py-[60px] tab:py-20 desk:py-[120px]">
      <Container>
        <Reveal className="mx-auto flex max-w-[760px] flex-col items-center text-center">
          <ComingSoonBadge />
          <SectionHeading eyebrow={eyebrow} title={title} align="center" className="mt-6" />
          {highlight && (
            <div className="mt-6 w-full rounded-[6px] border-l-4 border-primary bg-surface px-6 py-4 text-left text-[18px] leading-[27px] text-ink">
              {highlight}
            </div>
          )}
          <div className="mt-6 text-[18px] leading-[27px] text-muted">{intro}</div>
        </Reveal>
        <Reveal delay={100}>
          <ul className="mt-10 grid gap-5 tab:mt-12 tab:grid-cols-3 tab:gap-6 desk:gap-[30px]">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex flex-col rounded-[6px] bg-soft p-[30px]">
                  <span className="flex size-16 items-center justify-center rounded-[4px] bg-white text-primary">
                    <Icon aria-hidden className="size-[34px]" strokeWidth={1.25} />
                  </span>
                  <h3 className="mt-6 text-[22px] leading-8 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-[16px] leading-6 text-ink-deep">{item.description}</p>
                </li>
              );
            })}
          </ul>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 tab:mt-12 tab:flex-row">{actions}</div>
        </Reveal>
      </Container>
    </section>
  );
}
