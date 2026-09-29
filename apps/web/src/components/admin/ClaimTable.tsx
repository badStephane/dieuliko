import Link from "next/link";
import { claimStatusLabel, type ClaimStatus, type ClaimSummary } from "@/features/admin/claims-api";
import { adminClaimPath } from "@/features/admin/paths";
import { formatDate } from "@/lib/format";
import { StatusBadge, type BadgeTone } from "./StatusBadge";

const CELL = "px-3 py-3 align-middle";

export const CLAIM_TONES: Readonly<Record<ClaimStatus, BadgeTone>> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  revoked: "danger",
  cancelled: "neutral",
};

/** Claims of the queue, each opening its review page; on phones the requester moves under the listing. */
export function ClaimTable({ claims }: { readonly claims: readonly ClaimSummary[] }) {
  return (
    <div className="-mx-5 overflow-x-auto tab:-mx-8">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[14px] leading-5 font-semibold text-muted">
            <th scope="col" className={`${CELL} pl-5 tab:pl-8`}>
              Fiche demandée
            </th>
            <th scope="col" className={`${CELL} hidden desk:table-cell`}>
              Demandeur
            </th>
            <th scope="col" className={`${CELL} hidden pr-8 text-right tab:table-cell`}>
              Reçue le
            </th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id} className="border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-surface/70">
              <td className={`${CELL} pr-5 pl-5 tab:pl-8`}>
                <Link href={adminClaimPath(claim.id)} className="group flex min-h-12 flex-col justify-center gap-1 focus-visible:outline-2 focus-visible:outline-primary">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] leading-6 font-semibold break-words text-ink underline-offset-4 group-hover:underline">{claim.company.name}</span>
                    <StatusBadge tone={CLAIM_TONES[claim.status]}>{claimStatusLabel(claim.status)}</StatusBadge>
                  </span>
                  <span className="text-[14px] leading-5 text-muted">{claim.company.city}</span>
                  <span className="text-[14px] leading-5 break-all text-ink-deep desk:hidden">
                    {claim.requester.firstName} {claim.requester.lastName} · {claim.jobTitle}
                  </span>
                </Link>
              </td>
              <td className={`${CELL} hidden desk:table-cell`}>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] leading-[22px] font-semibold text-ink">
                    {claim.requester.firstName} {claim.requester.lastName} · {claim.jobTitle}
                  </span>
                  <span className="text-[14px] leading-5 break-all text-muted">{claim.requester.email}</span>
                </span>
              </td>
              <td className={`${CELL} hidden pr-8 text-right text-[14px] whitespace-nowrap text-muted tab:table-cell`}>{formatDate(claim.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
