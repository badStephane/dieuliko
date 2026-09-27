import Image from "next/image";
import type { ReactNode } from "react";

const BANNER_PATTERN_SRC = "/images/RtDLClPwZJMlnwCrtQ6TVc0o0s.png";
const DEFAULT_SUBTITLE = "L’annuaire des entreprises du Sénégal, pour candidater même sans offre publiée.";

interface PageBannerProps {
  readonly title: string;
  readonly subtitle?: string;
  /** Extra content rendered under the subtitle (e.g. the search bar overlapping the banner edge). */
  readonly children?: ReactNode;
  /** Extra classes on the <section> (page-specific overrides of the inner layout). */
  readonly className?: string;
  /** Bottom padding of the title block (Contact / About use a shorter one than the default). */
  readonly bottomPaddingClassName?: string;
}

const DEFAULT_BOTTOM_PADDING = "pb-[60px] tab:pb-20 desk:pb-[120px]";

/**
 * Mint hero with the faded grid pattern used at the top of every inner page (Blogs, Job Listing,
 * Companies, About, Contact…). It starts at y=0 and runs under the floating header card.
 */
export function PageBanner({
  title,
  subtitle = DEFAULT_SUBTITLE,
  children,
  className = "",
  bottomPaddingClassName = DEFAULT_BOTTOM_PADDING,
}: PageBannerProps) {
  return (
    <section className={`relative isolate bg-surface ${className}`}>
      <Image
        src={BANNER_PATTERN_SRC}
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover grayscale"
      />
      <div className={`px-5 pt-[140px] tab:px-[30px] tab:pt-[150px] desk:pt-[184px] ${bottomPaddingClassName}`}>
        <div className="mx-auto flex max-w-[470px] flex-col items-center text-center">
          <h1 className="text-[49px] leading-[1.3] font-bold tab:text-[61px] desk:text-[76px]">{title}</h1>
          <p className="mt-2.5 text-[18px] leading-[27px] text-ink-deep">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
