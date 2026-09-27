const FRENCH_NUMBER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
/** Intl's narrow no-break space is missing from the heading font: use a regular no-break space. */
const NARROW_NBSP = / /g;

/** French number ("1 904", "4,6") with a no-break space as thousands separator. */
export function formatNumber(value: number): string {
  return FRENCH_NUMBER.format(value).replace(NARROW_NBSP, " ");
}
