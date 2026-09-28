const FRENCH_NUMBER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
/** Intl's narrow no-break space is missing from the heading font: use a regular no-break space. */
const NARROW_NBSP = / /g;

/** French number ("1 904", "4,6") with a no-break space as thousands separator. */
export function formatNumber(value: number): string {
  return FRENCH_NUMBER.format(value).replace(NARROW_NBSP, " ");
}

const KILO = 1024;
const MEGA = KILO * KILO;
const FRENCH_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Dakar" });

/** File size in French units: "250 Ko" below 1 Mo, "1,3 Mo" above (at least "1 Ko"). */
export function formatFileSize(bytes: number): string {
  if (bytes < MEGA) return `${formatNumber(Math.max(1, Math.round(bytes / KILO)))} Ko`;
  return `${formatNumber(bytes / MEGA)} Mo`;
}

/** Date as "28 septembre 2026", in Senegal's time zone. */
export function formatDate(iso: string): string {
  return FRENCH_DATE.format(new Date(iso));
}
