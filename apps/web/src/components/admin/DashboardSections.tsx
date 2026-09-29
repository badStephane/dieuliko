import { BadgeCheck, ChevronRight, ImageOff, FileText, PhoneOff, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AuditEntry, Stats } from "@/features/admin/admin-api";
import { ADMIN_AUDIT_PATH, ADMIN_CANDIDATES_PATH, ADMIN_CLAIMS_PATH, ADMIN_COMPANIES_PATH, adminCandidatePath, adminCompanyPath } from "@/features/admin/paths";
import { formatDate, formatNumber } from "@/lib/format";
import { auditActor, auditTarget, auditVerb } from "./audit-text";
import { DailyBarChart } from "./dashboard/DailyBarChart";
import { KpiTile } from "./dashboard/KpiTile";
import { listHref } from "./list-href";
import { ADMIN_CARD, FOCUS_RING, SECTION_TITLE, TEXT_LINK } from "./styles";
import { countLabel, percentOf } from "./text";

const qualityHref = (qualityParam: string) => listHref(ADMIN_COMPANIES_PATH, { q: "", statusParam: "", page: 1, qualityParam });

function Kpis({ stats }: { readonly stats: Stats }) {
  const { trends } = stats;
  return (
    <section aria-label="Chiffres clés">
      <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 desk:grid-cols-4">
        <li><KpiTile label="Candidats inscrits" value={stats.candidates.total} trend={trends.signups} href={ADMIN_CANDIDATES_PATH} /></li>
        <li><KpiTile label="Candidatures envoyées" value={stats.applications.sent} trend={trends.applications} /></li>
        <li><KpiTile label="Lettres de motivation" value={stats.letters} trend={trends.letters} /></li>
        <li>
          <KpiTile
            label="Fiches visibles"
            value={stats.companies.visible}
            hint={`${countLabel(stats.companies.verified, "vérifiée", "vérifiées")} · ${countLabel(stats.companies.hidden, "masquée", "masquées")}`}
            href={ADMIN_COMPANIES_PATH}
          />
        </li>
      </ul>
    </section>
  );
}

/** Company accounts waiting for a review: shown only when there are some, as each one blocks a company. */
function PendingClaims({ count }: { readonly count: number }) {
  if (count === 0) return null;
  return (
    <Link
      href={ADMIN_CLAIMS_PATH}
      className={`group flex items-center gap-4 rounded-[12px] bg-accent-soft/60 p-5 transition-colors duration-150 hover:bg-accent-soft tab:p-6 ${FOCUS_RING}`}
    >
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-primary-deep">
        <BadgeCheck className="size-5" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[18px] leading-7 font-semibold text-ink">
          {countLabel(count, "demande de gestion de fiche", "demandes de gestion de fiche")} à traiter
        </span>
        <span className="text-[15px] leading-[22px] text-ink-deep">Des entreprises attendent votre vérification pour accéder à leur espace.</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5" />
    </Link>
  );
}

interface TodoItem {
  readonly label: string;
  readonly count: number;
  readonly icon: LucideIcon;
  readonly qualityParam: string;
}

/** Listings to complete, each opening the list filtered on what is missing. */
function Todo({ stats }: { readonly stats: Stats }) {
  const total = stats.companies.visible + stats.companies.hidden;
  const items: readonly TodoItem[] = [
    { label: "sans logo", count: stats.quality.noLogo, icon: ImageOff, qualityParam: "logo" },
    { label: "sans description", count: stats.quality.noDescription, icon: FileText, qualityParam: "description" },
    { label: "sans contact", count: stats.quality.noContact, icon: PhoneOff, qualityParam: "contact" },
    { label: "non vérifiées", count: stats.quality.unverified, icon: ShieldCheck, qualityParam: "verification" },
  ];
  return (
    <section aria-labelledby="dashboard-todo" className={ADMIN_CARD}>
      <div className="flex flex-col gap-1">
        <h2 id="dashboard-todo" className={SECTION_TITLE}>
          À compléter
        </h2>
        <p className="text-[16px] leading-6 text-muted">Des fiches complètes donnent envie de postuler. Ouvrez une catégorie pour les traiter une à une.</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 desk:grid-cols-4">
        {items.map(({ label, count, icon: Icon, qualityParam }) => (
          <li key={qualityParam}>
            <Link
              href={qualityHref(qualityParam)}
              className={`group flex h-full items-center gap-4 rounded-[10px] bg-surface/70 p-4 transition-colors duration-150 hover:bg-accent-soft/60 ${FOCUS_RING}`}
            >
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-primary-deep shadow-[0_0_0_1px_var(--color-line)]">
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-2">
                  <span className="text-[24px] leading-8 font-bold text-ink">{formatNumber(count)}</span>
                  <span className="text-[14px] leading-5 text-muted">{percentOf(count, total)} %</span>
                </span>
                <span className="text-[15px] leading-5 text-ink-deep">
                  {count > 1 ? "fiches" : "fiche"} {label}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Charts({ daily }: { readonly daily: Stats["daily"] }) {
  return (
    <div className="grid grid-cols-1 gap-6 desk:grid-cols-2">
      <section aria-label="Inscriptions par jour" className={ADMIN_CARD}>
        <DailyBarChart title="Inscriptions" unit={["inscription", "inscriptions"]} points={daily.map(({ day, signups }) => ({ day, value: signups }))} />
      </section>
      <section aria-label="Candidatures par jour" className={ADMIN_CARD}>
        <DailyBarChart title="Candidatures" unit={["candidature", "candidatures"]} points={daily.map(({ day, applications }) => ({ day, value: applications }))} />
      </section>
    </div>
  );
}

/** Share of the candidates who went one step further; the track is a lighter step of the fill's hue. */
function Meter({ label, part, total }: { readonly label: string; readonly part: number; readonly total: number }) {
  const percent = percentOf(part, total);
  return (
    <li className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3 text-[15px] leading-6">
        <span className="text-ink-deep">{label}</span>
        <span className="font-semibold text-ink tabular-nums">
          {percent} % <span className="font-normal text-muted">({formatNumber(part)})</span>
        </span>
      </span>
      <span
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="block h-2 overflow-hidden rounded-full bg-accent-soft"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </span>
    </li>
  );
}

function Accounts({ candidates }: { readonly candidates: Stats["candidates"] }) {
  const { total } = candidates;
  return (
    <section aria-labelledby="dashboard-accounts" className={ADMIN_CARD}>
      <h2 id="dashboard-accounts" className={SECTION_TITLE}>
        Comptes candidats
      </h2>
      <ul className="flex flex-col gap-4">
        <Meter label="Emails confirmés" part={candidates.verifiedEmails} total={total} />
        <Meter label="Profils remplis" part={candidates.withProfile} total={total} />
        <Meter label="CV déposés" part={candidates.withCv} total={total} />
      </ul>
      <p className="text-[15px] leading-6 text-muted">
        {countLabel(candidates.last30Days, "inscription", "inscriptions")} sur 30 jours ·{" "}
        <Link href={listHref(ADMIN_CANDIDATES_PATH, { q: "", statusParam: "suspendus", page: 1 })} className="font-semibold text-ink underline-offset-4 hover:underline">
          {countLabel(candidates.suspended, "compte suspendu", "comptes suspendus")}
        </Link>
      </p>
    </section>
  );
}

function Feed({ id, title, more, empty, children }: { readonly id: string; readonly title: string; readonly more?: ReactNode; readonly empty: string; readonly children: ReactNode[] }) {
  return (
    <section aria-labelledby={id} className={ADMIN_CARD}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className={SECTION_TITLE}>
          {title}
        </h2>
        {more}
      </div>
      {children.length > 0 ? <ul className="flex flex-col divide-y divide-line">{children}</ul> : <p className="text-[16px] leading-6 text-muted">{empty}</p>}
    </section>
  );
}

function FeedRow({ href, primary, secondary }: { readonly href: string; readonly primary: ReactNode; readonly secondary: string }) {
  return (
    <li>
      <Link href={href} className={`group flex min-h-12 items-center gap-3 py-2.5 ${FOCUS_RING}`}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] leading-6 break-words text-ink group-hover:underline group-hover:underline-offset-4">{primary}</span>
          <span className="text-[14px] leading-5 text-muted">{secondary}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}

function Recent({ stats, audit }: { readonly stats: Stats; readonly audit: readonly AuditEntry[] | null }) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 desk:grid-cols-3">
      <Feed
        id="recent-candidates"
        title="Nouveaux candidats"
        empty="Aucune inscription pour l’instant."
        more={<Link href={ADMIN_CANDIDATES_PATH} className={TEXT_LINK}>Tous</Link>}
      >
        {stats.recentCandidates.map((candidate) => (
          <FeedRow
            key={candidate.id}
            href={adminCandidatePath(candidate.id)}
            primary={`${candidate.firstName} ${candidate.lastName}`.trim() || "Candidat sans nom"}
            secondary={`Inscription le ${formatDate(candidate.createdAt)}`}
          />
        ))}
      </Feed>
      <Feed id="recent-applications" title="Dernières candidatures" empty="Aucune candidature envoyée pour l’instant.">
        {stats.recentApplications.map((application) => (
          <FeedRow
            key={`${application.slug}-${application.createdAt}`}
            href={adminCompanyPath(application.slug)}
            primary={application.name}
            secondary={`Candidature reçue le ${formatDate(application.createdAt)}`}
          />
        ))}
      </Feed>
      <Feed
        id="recent-actions"
        title="Actions de l’équipe"
        empty={audit ? "Aucune action enregistrée pour l’instant." : "Le journal est momentanément indisponible."}
        more={<Link href={ADMIN_AUDIT_PATH} className={TEXT_LINK}>Journal</Link>}
      >
        {(audit ?? []).map((entry) => (
          <FeedRow
            key={entry.id}
            href={ADMIN_AUDIT_PATH}
            primary={
              <>
                <span className="font-semibold">{auditActor(entry)}</span> {auditVerb(entry.action)} {auditTarget(entry)}
              </>
            }
            secondary={formatDate(entry.createdAt)}
          />
        ))}
      </Feed>
    </div>
  );
}

function TopCompanies({ companies }: { readonly companies: Stats["topCompanies"] }) {
  return (
    <Feed id="top-companies" title="Entreprises les plus sollicitées (30 jours)" empty="Aucune candidature envoyée ces 30 derniers jours.">
      {companies.map((company, index) => (
        <FeedRow
          key={company.slug}
          href={adminCompanyPath(company.slug)}
          primary={
            <>
              <span aria-hidden className="mr-2 font-bold text-primary-deep">{index + 1}</span>
              {company.name}
            </>
          }
          secondary={`${company.city} · ${countLabel(company.applications, "candidature", "candidatures")}`}
        />
      ))}
    </Feed>
  );
}

/** The dashboard: key figures, what to complete, the last 30 days, and what just happened. */
export function DashboardSections({ stats, audit }: { readonly stats: Stats; readonly audit: readonly AuditEntry[] | null }) {
  return (
    <div className="flex flex-col gap-6">
      <Kpis stats={stats} />
      <PendingClaims count={stats.companies.pendingClaims} />
      <Todo stats={stats} />
      <Charts daily={stats.daily} />
      <div className="grid grid-cols-1 items-start gap-6 desk:grid-cols-2">
        <Accounts candidates={stats.candidates} />
        <TopCompanies companies={stats.topCompanies} />
      </div>
      <Recent stats={stats} audit={audit} />
    </div>
  );
}
