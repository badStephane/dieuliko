import Image from "next/image";
import { Send } from "lucide-react";
import { Container } from "@/components/ui/Container";
import styles from "@/components/sections/decorations.module.css";
import { getSectorLabel } from "@/features/companies/sectors";
import { formatNumber } from "@/lib/format";
import { HeroSearch } from "./HeroSearch";
import { RadarDisc, TintedShape } from "./HeroDecorations";
import { SectorIcon } from "./SectorIcon";

const SPARKLE_SRC = "/images/JnkFEbXaK9ZAHNGhAr4tyOpgmQ.svg";
const TARGET_SRC = "/images/4S7rVN2KEfCCb8gF0DbmhyPTc.svg";
const SQUIGGLE_SRC = "/images/XTxrhrnEwdsExQiIY7qas7srxlU.png";
const SECTOR_BUBBLE_OFFSETS = ["", "-ml-[15px]", "-ml-[11px]", "-ml-[13px]"] as const;
const POPULAR_SECTOR_COUNT = 3;

interface HomeHeroProps {
  readonly companyCount: number;
  /** Largest sectors (slugs), largest first: search shortcuts and card bubbles. */
  readonly topSectors: readonly string[];
}

/** « Trouvez. Déposez. Avancez. » in the 84px two-tone treatment of the template. */
function HeroTitle() {
  return (
    <h1 className="text-[38px] leading-[1.2] font-extrabold text-ink uppercase tab:text-[70px] desk:text-[84px]">
      Trouvez. <br className="hidden desk:inline" />
      <span className="text-primary">Déposez.</span>
      <span
        aria-hidden
        className="relative -top-[4px] ml-6 hidden size-[72px] items-center justify-center rounded-full bg-ink align-middle desk:inline-flex"
      >
        <Send className="size-8 text-primary" strokeWidth={2} />
      </span>{" "}
      <br className="hidden desk:inline" />
      Avancez.
    </h1>
  );
}

/** Top floating card: what the platform lets candidates do. */
function SpontaneousCard() {
  return (
    <div
      className={`absolute top-[89px] left-[3.7%] z-20 hidden items-center gap-2.5 rounded-[4px] bg-white p-3 tab:flex desk:top-[33px] desk:left-[4px] ${styles.pulse} [--pulse-to:1.1]`}
    >
      <Image src="/brand/icon-dark.svg" alt="" width={48} height={48} className="size-12 rounded-[4px]" />
      <p className="text-[16px] leading-6 text-ink-deep">
        Candidature spontanée,
        <br />
        même sans offre publiée
      </p>
    </div>
  );
}

/** Bottom floating card: real size of the directory + its main sectors. */
function DirectoryCard({ companyCount, topSectors }: HomeHeroProps) {
  return (
    <div className="absolute bottom-[10px] left-0 z-20 hidden w-[213px] rounded-t-[5px] bg-white p-5 tab:block desk:top-[584px] desk:bottom-auto desk:left-[477px] desk:h-[124px]">
      <p className="text-[20px] leading-[30px] font-semibold text-ink">{formatNumber(companyCount)} entreprises</p>
      <ul className="mt-2.5 flex">
        {topSectors.slice(0, SECTOR_BUBBLE_OFFSETS.length).map((slug, index) => (
          <li
            key={slug}
            title={getSectorLabel(slug)}
            className={`flex size-11 items-center justify-center rounded-full border-2 border-white bg-accent-soft ${SECTOR_BUBBLE_OFFSETS[index]}`}
          >
            <SectorIcon sector={slug} className="size-5 text-primary-deep" />
            <span className="sr-only">{getSectorLabel(slug)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Photo + rotating disc, floating cards and pulsing doodles (recoloured to the brand). */
function HeroVisual(props: HomeHeroProps) {
  return (
    <div className="relative mt-6 aspect-[350/342] w-full tab:mt-[30px] tab:aspect-[940/892] desk:absolute desk:top-[189px] desk:left-[555px] desk:mt-0 desk:mb-0 desk:aspect-auto desk:h-[714px] desk:w-[730px]">
      <div
        aria-hidden
        className="absolute top-[-8px] left-0 aspect-square w-full tab:top-[55px] tab:left-[35.6%] tab:w-[51%] desk:top-[36px] desk:left-[144px] desk:w-[500px]"
      >
        <RadarDisc className={`size-full ${styles.spin}`} />
      </div>
      <Image
        src="/images/tg9JUUctxuAqbNIeZIwz3GiQYPo.png"
        alt="Jeune professionnel enthousiaste, ordinateur portable en main"
        fill
        priority
        sizes="(min-width: 1200px) 730px, 100vw"
        className="z-10 object-cover"
      />
      <TintedShape
        src={SPARKLE_SRC}
        tone="bg-primary/35"
        className={`absolute top-[87px] left-[88.6%] z-10 h-[38px] w-9 tab:top-[-25px] tab:left-[4.8%] desk:top-[-43px] desk:left-[-589px] ${styles.pulse} [--pulse-to:1.2]`}
      />
      <TintedShape
        src={TARGET_SRC}
        tone="bg-primary/35"
        className={`absolute top-[-134px] left-[90%] hidden size-[59px] tab:block desk:top-[-19px] desk:left-[602px] ${styles.pulse} [--pulse-duration:3s] [--pulse-to:1.3]`}
      />
      <TintedShape
        src={SQUIGGLE_SRC}
        tone="bg-primary/30"
        className={`absolute top-[499px] left-[4px] z-10 hidden h-[77px] w-[132px] desk:block ${styles.pulse} [--pulse-to:0.9]`}
      />
      <SpontaneousCard />
      <DirectoryCard {...props} />
    </div>
  );
}

/** Home hero: tagline, directory search and photo on the light surface. */
export function HomeHero({ companyCount, topSectors }: HomeHeroProps) {
  return (
    <section className="overflow-hidden bg-surface">
      <Container className="relative desk:h-[897px]">
        <div className="pt-40 tab:pt-[175px] desk:w-[520px] desk:pt-[255px]">
          <HeroTitle />
          <p className="mt-6 text-[18px] leading-[27px] text-ink-deep/90">
            Explorez {formatNumber(companyCount)} entreprises au Sénégal et envoyez votre candidature spontanée, même
            quand aucune offre n&apos;est publiée.
          </p>
          <HeroSearch popularSectors={topSectors.slice(0, POPULAR_SECTOR_COUNT)} />
        </div>
        <HeroVisual companyCount={companyCount} topSectors={topSectors} />
      </Container>
    </section>
  );
}
