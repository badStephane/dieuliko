import { ChevronRight, Send } from "lucide-react";
import Link from "next/link";
import type { Application } from "@/features/candidate/candidate-api";
import { applicationPath } from "@/features/candidate/paths";
import { formatDate } from "@/lib/format";

/** "Envoyée le 28 sept." or "Retirée le 29 sept.": where the application stands, in a few words. */
export function applicationStatusLabel(application: Application): string {
  return application.status === "withdrawn" && application.withdrawnAt
    ? `Retirée le ${formatDate(application.withdrawnAt)}`
    : `Envoyée le ${formatDate(application.createdAt)}`;
}

/** The candidate's spontaneous applications, most recent first; each opens its read-only view. */
export function ApplicationsCard({ applications }: { readonly applications: readonly Application[] }) {
  return (
    <section aria-labelledby="applications-title" className="flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8">
      <div className="flex flex-col gap-1.5">
        <h2 id="applications-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
          Mes candidatures
        </h2>
        <p className="text-[15px] leading-[22px] text-muted">
          Vos candidatures sont enregistrées sur Dieuliko : chaque entreprise pourra les consulter depuis son espace.
        </p>
      </div>
      {applications.length === 0 ? (
        <p className="text-[17px] leading-[26px] text-ink-deep">
          Aucune candidature pour l’instant. Une fois votre lettre enregistrée pour une entreprise, envoyez votre candidature depuis la page de la lettre.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {applications.map((application) => (
            <li key={application.id}>
              <Link
                href={applicationPath(application.id)}
                className="group flex min-h-14 items-center gap-4 py-3 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Send aria-hidden className={`size-6 shrink-0 ${application.status === "sent" ? "text-primary" : "text-muted"}`} strokeWidth={1.5} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[17px] leading-[26px] font-semibold text-ink underline-offset-4 group-hover:underline">{application.companyName}</span>
                  <span className="text-[15px] leading-[22px] text-muted">
                    {application.companyCity} · {applicationStatusLabel(application)}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
