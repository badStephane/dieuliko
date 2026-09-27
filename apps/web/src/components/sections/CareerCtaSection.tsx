import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { COMPANY_SPACE_PATH } from "@/lib/navigation";
import styles from "./decorations.module.css";

const TEAM_IMAGE_SRC = "/images/uE69PTRE0aYUlytbKWbEHxoZaXs.png";
const SIDE_IMAGE_SRC = "/images/8puHVDR7yMmbOkuEtWbVKipA7I8.png";

/** Faint diagonal hatching on navy (replaces the template's teal background image). */
const HATCHING_CLASSES = "bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.035)_0_1px,transparent_1px_22px)]";

type CtaVariant = "home" | "about";

/** Tablet layout differs between pages: About has a full-width title and a full-width square side image. */
const VARIANT_CLASSES: Record<CtaVariant, { title: string; row: string; sideImage: string }> = {
  home: { title: "tab:max-w-[85%] desk:max-w-none", row: "tab:mt-[30px]", sideImage: "tab:max-w-[708px]" },
  about: { title: "", row: "tab:mt-[34px]", sideImage: "" },
};

interface CareerCtaSectionProps {
  /** Home shows an arrow in the button; the About page does not. */
  readonly withArrow?: boolean;
  /** Page-specific tablet layout: "home" (default) or "about". */
  readonly variant?: CtaVariant;
}

/** Thought bubble (was a lime PNG with baked-in English text). */
function ThoughtBubble() {
  return (
    <div
      aria-hidden
      className={`absolute top-[-10px] left-0 hidden h-[179px] w-[198px] desk:block ${styles.pulse} [--pulse-to:1.05]`}
    >
      <p className="flex h-[148px] w-[186px] items-center justify-center rounded-[48%_52%_46%_54%/55%_50%_50%_45%] bg-accent-soft px-6 text-center font-heading text-[18px] leading-[1.3] font-bold text-ink">
        Votre entreprise est-elle déjà listée&nbsp;?
      </p>
      <span className="absolute top-[146px] left-[172px] size-[18px] rounded-full border-2 border-accent-soft" />
      <span className="absolute top-[170px] left-[190px] size-3 rounded-full border-2 border-accent-soft" />
    </div>
  );
}

/** Dark navy « Rejoignez l'annuaire » call to action for companies (Home, About). */
export function CareerCtaSection({ withArrow = true, variant = "home" }: CareerCtaSectionProps) {
  const layout = VARIANT_CLASSES[variant];
  return (
    <section className={`relative overflow-hidden bg-ink py-[60px] tab:py-20 desk:py-[120px] ${HATCHING_CLASSES}`}>
      <Container className="relative">
        <Reveal className="flex flex-col gap-[30px] tab:gap-10 desk:flex-row desk:items-start desk:justify-between desk:gap-10">
          <div className="flex flex-col desk:relative desk:h-[373px] desk:w-[860px] desk:shrink-0">
            <ThoughtBubble />
            <h2
              className={`text-[36px] leading-[1.2] font-bold text-white ${layout.title} tab:text-[45px] desk:absolute desk:top-[11px] desk:left-[310px] desk:w-[550px] desk:text-center desk:text-[56px]`}
            >
              Rejoignez l&rsquo;annuaire Dieuliko
            </h2>
            <div
              className={`mt-[30px] flex flex-col gap-2.5 ${layout.row} tab:flex-row tab:items-center tab:justify-center tab:gap-5 desk:absolute desk:top-[193px] desk:left-[90px] desk:mt-0 desk:items-start desk:justify-start desk:gap-14`}
            >
              <div className="relative h-[169px] w-full shrink-0 overflow-hidden rounded-[6px] tab:w-[341px] desk:w-[384px]">
                <Image
                  src={TEAM_IMAGE_SRC}
                  alt="Équipe souriante réunie autour de documents"
                  fill
                  sizes="(min-width: 810px) 384px, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="flex min-w-0 flex-col items-start tab:w-[409px] desk:w-[330px]">
                <p className="max-w-[330px] text-[18px] leading-[27px] text-white tab:max-w-none">
                  Revendiquez la fiche de votre entreprise ou créez-la, puis recevez les candidatures spontanées des
                  talents qui veulent vous rejoindre.
                </p>
                <ButtonLink href={COMPANY_SPACE_PATH} className="mt-5 gap-2! tab:mt-8">
                  Espace entreprise
                  {withArrow && <ArrowRight aria-hidden className="size-6" strokeWidth={1.5} />}
                </ButtonLink>
              </div>
            </div>
          </div>
          <div
            className={`relative aspect-[350/373] w-full overflow-hidden rounded-[6px] tab:aspect-square ${layout.sideImage} desk:aspect-auto desk:h-[373px] desk:w-[300px] desk:shrink-0`}
          >
            <Image
              src={SIDE_IMAGE_SRC}
              alt="Jeunes professionnels travaillant ensemble sur un ordinateur portable"
              fill
              sizes="(min-width: 1200px) 300px, 100vw"
              className="object-cover"
            />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
