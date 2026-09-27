import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { SectorCount } from "@/features/companies/filters";
import { getSectorIcon } from "@/features/companies/sector-icons";
import { getSectorLabel } from "@/features/companies/sectors";
import { formatNumber } from "@/lib/format";
import { COMPANIES_PATH, sectorHref } from "@/lib/navigation";

const ICON_CLASSES = "size-6 text-primary";

function RollingIcon({ Icon }: { readonly Icon: LucideIcon }) {
  return (
    <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white transition-colors duration-300 group-hover:bg-accent-soft">
      <Icon
        aria-hidden
        strokeWidth={1.75}
        className={`${ICON_CLASSES} transition-transform duration-300 group-hover:-translate-y-[52px]`}
      />
      <Icon
        aria-hidden
        strokeWidth={1.75}
        className={`${ICON_CLASSES} absolute translate-y-[52px] transition-transform duration-300 group-hover:translate-y-0`}
      />
    </span>
  );
}

/** Pill link: on hover the disc turns orange-tinted, the label orange and the icon rolls up. */
function SectorPill({ sector }: { readonly sector: SectorCount }) {
  const label = getSectorLabel(sector.sector);
  const count = formatNumber(sector.count);
  return (
    <Link
      href={sectorHref(sector.sector)}
      aria-label={`${label} : ${count} entreprises`}
      className={`${PILL_CLASSES} border-line bg-soft`}
    >
      <RollingIcon Icon={getSectorIcon(sector.sector)} />
      <span className="min-w-0 flex-1 text-[18px] leading-[23px] font-semibold text-ink transition-colors duration-300 group-hover:text-primary-deep desk:text-[19px]">
        {label}
      </span>
      <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[14px] leading-[21px] font-semibold text-muted transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
        {count}
      </span>
    </Link>
  );
}

const PILL_CLASSES =
  "group flex h-16 items-center gap-3 rounded-[32px] border pr-5 pl-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Last pill: the whole directory (fills the grid's last cell). */
function AllCompaniesPill({ total }: { readonly total: number }) {
  return (
    <Link
      href={COMPANIES_PATH}
      className={`${PILL_CLASSES} border-ink bg-ink transition-colors duration-300 hover:border-primary hover:bg-primary`}
    >
      <RollingIcon Icon={ArrowRight} />
      <span className="min-w-0 flex-1 text-[18px] leading-[23px] font-semibold text-white desk:text-[19px]">
        Toutes les entreprises
      </span>
      <span className="shrink-0 text-[14px] leading-[21px] font-semibold text-white/80">{formatNumber(total)}</span>
    </Link>
  );
}

/** « Explorer par secteur » — every sector of the directory with its company count. */
export function CategorySection({ sectors }: { readonly sectors: readonly SectorCount[] }) {
  const total = sectors.reduce((sum, sector) => sum + sector.count, 0);
  return (
    <section className="bg-white pt-[60px] pb-[30px] tab:pt-20 tab:pb-10 desk:py-[120px]">
      <Container>
        <Reveal className="flex flex-col items-start gap-6 tab:flex-row tab:items-end tab:justify-between tab:gap-[30px]">
          <SectionHeading eyebrow={`${sectors.length} secteurs d'activité`} title="Explorer par secteur" />
          <ButtonLink href={COMPANIES_PATH} className="shrink-0">
            Tout l&apos;annuaire
          </ButtonLink>
        </Reveal>
        <Reveal delay={100}>
          <ul className="mt-10 grid grid-cols-1 gap-4 tab:mt-[46px] tab:grid-cols-2 tab:gap-5 desk:mt-14 desk:grid-cols-3 desk:gap-6">
            {sectors.map((sector) => (
              <li key={sector.sector}>
                <SectorPill sector={sector} />
              </li>
            ))}
            <li>
              <AllCompaniesPill total={total} />
            </li>
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
