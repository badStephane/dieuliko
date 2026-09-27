import Image from "next/image";
import type { Company } from "@/features/companies/company";
import { getMonogram } from "@/features/companies/profile";
import { SECTORS } from "@/features/companies/sectors";

type AvatarSize = "sm" | "md" | "lg";

interface CompanyAvatarProps {
  readonly company: Pick<Company, "name" | "sector" | "logoUrl">;
  readonly size?: AvatarSize;
  readonly className?: string;
}

/** Brand-token backgrounds; each sector always gets the same one. */
const SECTOR_TONES: readonly string[] = [
  "bg-primary text-white",
  "bg-ink text-white",
  "bg-accent-soft text-primary-deep",
  "bg-primary/15 text-ink",
  "bg-ink/10 text-ink",
  "bg-surface text-primary-deep",
];

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "size-12 rounded-full text-[17px]",
  md: "size-[95px] rounded-full text-[32px]",
  lg: "size-[96px] rounded-[6px] text-[34px] tab:size-[144px] tab:text-[48px]",
};

const SIZE_PX: Record<AvatarSize, number> = { sm: 48, md: 95, lg: 144 };

function sectorTone(sector: string): string {
  const index = SECTORS.findIndex((item) => item.slug === sector);
  const position = index >= 0 ? index : sector.length;
  return SECTOR_TONES[position % SECTOR_TONES.length] ?? "";
}

/**
 * Company logo, or — since the scraped base has no logos yet — a monogram of the name on a
 * sector-tinted background. Decorative: the company name is always rendered next to it.
 */
export function CompanyAvatar({ company, size = "md", className = "" }: CompanyAvatarProps) {
  const base = `relative flex shrink-0 items-center justify-center overflow-hidden font-heading font-bold ${SIZE_CLASSES[size]}`;

  if (company.logoUrl) {
    return (
      <span className={`${base} border border-line bg-white ${className}`}>
        <Image
          src={company.logoUrl}
          alt=""
          width={SIZE_PX[size]}
          height={SIZE_PX[size]}
          unoptimized
          className="size-3/4 object-contain"
        />
      </span>
    );
  }

  return (
    <span aria-hidden className={`${base} ${sectorTone(company.sector)} ${className}`}>
      {getMonogram(company.name)}
    </span>
  );
}
