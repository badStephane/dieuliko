import type { CompanySummary } from "@/features/admin/admin-api";
import { StatusBadge } from "./StatusBadge";

/** Badges telling what the team did with a listing. */
export function CompanyBadges({ company }: { readonly company: Pick<CompanySummary, "hiddenAt" | "verified" | "curatedAt"> }) {
  if (!company.hiddenAt && !company.verified && !company.curatedAt) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {company.hiddenAt && <StatusBadge tone="danger">Masquée</StatusBadge>}
      {company.verified && <StatusBadge tone="success">Vérifiée</StatusBadge>}
      {company.curatedAt && <StatusBadge tone="warning">Modifiée</StatusBadge>}
    </span>
  );
}
