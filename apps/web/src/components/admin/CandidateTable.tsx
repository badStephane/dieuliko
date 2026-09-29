import { Check, Minus } from "lucide-react";
import Link from "next/link";
import type { CandidateSummary } from "@/features/admin/admin-api";
import { adminCandidatePath } from "@/features/admin/paths";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { candidateName, countLabel } from "./text";

const CELL = "px-3 py-3 align-middle";

function initials(candidate: CandidateSummary): string {
  const letters = `${candidate.firstName.charAt(0)}${candidate.lastName.charAt(0)}`.toUpperCase();
  return letters || candidate.email.charAt(0).toUpperCase();
}

/** One step of the journey: an icon and a word, never colour alone. */
function Step({ done, label }: { readonly done: boolean; readonly label: string }) {
  const Icon = done ? Check : Minus;
  return (
    <li className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] leading-5 font-semibold ${done ? "bg-emerald-50 text-emerald-800" : "bg-surface text-muted"}`}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
      <span>
        {label}
        <span className="sr-only">{done ? " : oui" : " : non"}</span>
      </span>
    </li>
  );
}

function Journey({ candidate }: { readonly candidate: CandidateSummary }) {
  return (
    <ul aria-label="Parcours" className="flex flex-wrap gap-1.5">
      <Step done={candidate.emailVerified} label="Email" />
      <Step done={candidate.hasProfile} label="Profil" />
      <Step done={candidate.hasCv} label="CV" />
      <Step
        done={candidate.applicationsSent > 0}
        label={candidate.applicationsSent > 0 ? countLabel(candidate.applicationsSent, "candidature", "candidatures") : "Candidature"}
      />
    </ul>
  );
}

/** Candidate accounts of a back-office search, each opening its status page; on phones the journey moves under the name. */
export function CandidateTable({ candidates }: { readonly candidates: readonly CandidateSummary[] }) {
  return (
    <div className="-mx-5 overflow-x-auto tab:-mx-8">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[14px] leading-5 font-semibold text-muted">
            <th scope="col" className={`${CELL} pl-5 tab:pl-8`}>
              Candidat
            </th>
            <th scope="col" className={`${CELL} hidden desk:table-cell`}>
              Parcours
            </th>
            <th scope="col" className={`${CELL} hidden pr-8 text-right tab:table-cell`}>
              Inscription
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.id} className="border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-surface/70">
              <td className={`${CELL} pr-5 pl-5 tab:pl-8`}>
                <Link href={adminCandidatePath(candidate.id)} className="group flex min-h-12 items-center gap-3 focus-visible:outline-2 focus-visible:outline-primary">
                  <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[16px] font-bold text-primary-deep">
                    {initials(candidate)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] leading-6 font-semibold break-words text-ink underline-offset-4 group-hover:underline">{candidateName(candidate)}</span>
                      {candidate.suspendedAt && <StatusBadge tone="danger">Suspendu</StatusBadge>}
                    </span>
                    <span className="text-[14px] leading-5 break-all text-muted">{candidate.email}</span>
                    <span className="desk:hidden">
                      <Journey candidate={candidate} />
                    </span>
                  </span>
                </Link>
              </td>
              <td className={`${CELL} hidden desk:table-cell`}>
                <Journey candidate={candidate} />
              </td>
              <td className={`${CELL} hidden pr-8 text-right text-[14px] whitespace-nowrap text-muted tab:table-cell`}>{formatDate(candidate.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
