/** Top of a count axis: the smallest "nice" number (1, 2, 5 × 10ⁿ) at or above the largest value; at least 1. */
export function niceMax(values: readonly number[]): number {
  const max = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= max) ?? 10;
  return step * magnitude;
}

/** Index of the largest value (the first one on ties); -1 when every value is 0, so nothing is highlighted. */
export function peakIndex(values: readonly number[]): number {
  const max = Math.max(0, ...values);
  return max === 0 ? -1 : values.indexOf(max);
}

const SHORT_DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG_DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "29 sept." for a "2026-09-29" date (already a Dakar date: formatted as is). */
export function shortDay(day: string): string {
  return SHORT_DAY.format(new Date(`${day}T00:00:00Z`));
}

/** "lundi 29 septembre" for a "2026-09-29" date. */
export function longDay(day: string): string {
  return LONG_DAY.format(new Date(`${day}T00:00:00Z`));
}

/** Signed change of a week against the one before: "+3", "−2", "0". */
export function signedChange(current: number, previous: number): string {
  const change = current - previous;
  if (change > 0) return `+${change}`;
  if (change < 0) return `−${Math.abs(change)}`;
  return "0";
}
