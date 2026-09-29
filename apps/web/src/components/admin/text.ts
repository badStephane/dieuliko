import type { CandidateSummary } from "@/features/admin/admin-api";
import { formatNumber } from "@/lib/format";

/** "1 entreprise", "0 entreprise", "12 entreprises" (French keeps the singular for 0 and 1). */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${formatNumber(count)} ${count > 1 ? plural : singular}`;
}

/** Share of `part` in `total` as a rounded percentage; 0 when there is no total. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** The candidate's full name, or their email when they left it empty. */
export function candidateName(candidate: Pick<CandidateSummary, "firstName" | "lastName" | "email">): string {
  return `${candidate.firstName} ${candidate.lastName}`.trim() || candidate.email;
}

/** "AD" for Awa Diop; the email's first letter when both names are empty. */
export function candidateInitials(candidate: Pick<CandidateSummary, "firstName" | "lastName" | "email">): string {
  const letters = `${candidate.firstName.trim().charAt(0)}${candidate.lastName.trim().charAt(0)}`.toUpperCase();
  return letters || candidate.email.charAt(0).toUpperCase();
}
