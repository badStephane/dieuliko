import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { CandidateSummary } from "@/features/admin/admin-api";
import { adminCandidatePath } from "@/features/admin/paths";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { candidateName } from "./text";

/** Candidate accounts found by a back-office search, each opening its status page. */
export function CandidateList({ candidates }: { readonly candidates: readonly CandidateSummary[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <Link
            href={adminCandidatePath(candidate.id)}
            className="group flex min-h-16 items-center gap-4 py-4 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[17px] leading-[26px] font-semibold break-words text-ink underline-offset-4 group-hover:underline">
                {candidateName(candidate)}
              </span>
              <span className="text-[15px] leading-[22px] break-all text-ink-deep">{candidate.email}</span>
              {(!candidate.emailVerified || candidate.suspendedAt) && (
                <span className="flex flex-wrap gap-2">
                  {!candidate.emailVerified && <StatusBadge tone="warning">Email non confirmé</StatusBadge>}
                  {candidate.suspendedAt && <StatusBadge tone="danger">Suspendu</StatusBadge>}
                </span>
              )}
              <span className="text-[14px] leading-5 text-muted">Inscrit le {formatDate(candidate.createdAt)}</span>
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
