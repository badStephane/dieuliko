import {
  Building2,
  Calculator,
  Clapperboard,
  Factory,
  GraduationCap,
  HardHat,
  HeartHandshake,
  Hotel,
  Landmark,
  Laptop,
  type LucideIcon,
  Megaphone,
  RadioTower,
  Scale,
  ShoppingBag,
  Stethoscope,
  Truck,
  Users,
  Wheat,
} from "lucide-react";

/** One pictogram per sector slug of `SECTORS`. */
const SECTOR_ICONS: ReadonlyMap<string, LucideIcon> = new Map([
  ["agro-agroalimentaire", Wheat],
  ["banque-assurance", Landmark],
  ["btp-ingenierie", HardHat],
  ["commerce-vente", ShoppingBag],
  ["education-formation", GraduationCap],
  ["finance-comptabilite", Calculator],
  ["hotellerie-tourisme", Hotel],
  ["industrie", Factory],
  ["informatique", Laptop],
  ["juridique", Scale],
  ["logistique-transport", Truck],
  ["marketing-communication", Megaphone],
  ["medias-audiovisuel", Clapperboard],
  ["ong-developpement", HeartHandshake],
  ["rh", Users],
  ["sante", Stethoscope],
  ["telecoms-energie", RadioTower],
]);

/** Icon for a sector slug; unknown sectors get a generic building. */
export function getSectorIcon(slug: string): LucideIcon {
  return SECTOR_ICONS.get(slug) ?? Building2;
}
