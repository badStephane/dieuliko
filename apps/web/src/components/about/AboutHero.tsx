import Image from "next/image";
import { PageBanner } from "@/components/layout/PageBanner";
import { Container } from "@/components/ui/Container";

/** Height of the photo part that hangs below the banner on desktop (600 - 216). */
const DESKTOP_OVERHANG_CLASS = "desk:-mb-[384px]";

const SUBTITLE =
  "Dieuliko rapproche les talents du Sénégal des entreprises qui recrutent, même quand aucune offre n’est publiée.";

/**
 * "À propos" banner with the team photo. Below 1200px the photo sits inside the banner; on desktop it
 * overlaps the banner's bottom edge (the banner ends 216px into the photo).
 */
export function AboutHero() {
  return (
    <PageBanner
      title="À propos"
      subtitle={SUBTITLE}
      className="flow-root"
      bottomPaddingClassName="pb-5 tab:pb-10 desk:pb-[88px]"
    >
      <Container className={`relative z-10 pb-10 tab:pb-[61px] desk:pb-0 ${DESKTOP_OVERHANG_CLASS}`}>
        <div className="relative h-[179px] overflow-hidden rounded-[6px] tab:aspect-[940/398] tab:h-auto desk:aspect-auto desk:h-[600px]">
          <Image
            src="/images/tHnJ1hvqPwK8B2F5Cv80bzhNuJE.png"
            alt="Une recruteuse serre la main d’un candidat lors d’une réunion d’équipe"
            fill
            priority
            sizes="(min-width: 1260px) 1200px, 100vw"
            className="object-cover"
          />
        </div>
      </Container>
    </PageBanner>
  );
}
