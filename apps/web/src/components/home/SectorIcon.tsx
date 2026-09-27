import { createElement } from "react";
import { getSectorIcon } from "@/features/companies/sector-icons";

interface SectorIconProps {
  readonly sector: string;
  readonly className?: string;
  readonly strokeWidth?: number;
}

/** Decorative pictogram of a sector (lookup kept static for the React compiler). */
export function SectorIcon({ sector, className = "", strokeWidth = 1.75 }: SectorIconProps) {
  return createElement(getSectorIcon(sector), { "aria-hidden": true, className, strokeWidth });
}
