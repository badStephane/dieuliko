import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Stats } from "@/features/admin/admin-api";
import { ADMIN_CANDIDATES_PATH, ADMIN_COMPANIES_PATH, adminCompanyPath } from "@/features/admin/paths";
import { CANDIDATE_STATUS_OPTIONS, COMPANY_STATUS_OPTIONS } from "./status-options";
import { listHref } from "./list-href";
import { StatTile } from "./StatTile";
import { ADMIN_CARD, SECTION_TITLE } from "./styles";
import { countLabel, percentOf } from "./text";

const statusHref = (basePath: string, statusParam: string) => listHref(basePath, { q: "", statusParam, page: 1 });
const shareOf = (part: number, total: number) => `${percentOf(part, total)} % des inscrits`;

const SUSPENDED = CANDIDATE_STATUS_OPTIONS.suspended.value;
const VISIBLE = COMPANY_STATUS_OPTIONS.visible.value;
const HIDDEN = COMPANY_STATUS_OPTIONS.hidden.value;

function StatGroup({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className={SECTION_TITLE}>
        {title}
      </h2>
      <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 tab:grid-cols-3 desk:grid-cols-4">{children}</ul>
    </section>
  );
}

function CandidateStats({ candidates }: { readonly candidates: Stats["candidates"] }) {
  const { total } = candidates;
  return (
    <StatGroup id="stats-candidates" title="Candidats">
      <li><StatTile label="Comptes candidats" value={total} href={ADMIN_CANDIDATES_PATH} /></li>
      <li><StatTile label="Inscrits sur 7 jours" value={candidates.last7Days} /></li>
      <li><StatTile label="Inscrits sur 30 jours" value={candidates.last30Days} /></li>
      <li><StatTile label="Emails confirmés" value={candidates.verifiedEmails} hint={shareOf(candidates.verifiedEmails, total)} /></li>
      <li><StatTile label="Profils remplis" value={candidates.withProfile} hint={shareOf(candidates.withProfile, total)} /></li>
      <li><StatTile label="CV déposés" value={candidates.withCv} hint={shareOf(candidates.withCv, total)} /></li>
      <li><StatTile label="Comptes suspendus" value={candidates.suspended} href={statusHref(ADMIN_CANDIDATES_PATH, SUSPENDED)} /></li>
    </StatGroup>
  );
}

function ActivityStats({ stats }: { readonly stats: Stats }) {
  return (
    <StatGroup id="stats-activity" title="Lettres et candidatures">
      <li><StatTile label="Lettres de motivation" value={stats.letters} /></li>
      <li><StatTile label="Candidatures envoyées" value={stats.applications.sent} /></li>
      <li><StatTile label="Candidatures retirées" value={stats.applications.withdrawn} /></li>
    </StatGroup>
  );
}

function CompanyStats({ companies }: { readonly companies: Stats["companies"] }) {
  return (
    <StatGroup id="stats-companies" title="Entreprises">
      <li><StatTile label="Fiches visibles" value={companies.visible} href={statusHref(ADMIN_COMPANIES_PATH, VISIBLE)} /></li>
      <li><StatTile label="Fiches masquées" value={companies.hidden} href={statusHref(ADMIN_COMPANIES_PATH, HIDDEN)} /></li>
      <li><StatTile label="Fiches vérifiées" value={companies.verified} /></li>
    </StatGroup>
  );
}

function TopCompanies({ companies }: { readonly companies: Stats["topCompanies"] }) {
  return (
    <section aria-labelledby="top-companies" className={ADMIN_CARD}>
      <h2 id="top-companies" className={SECTION_TITLE}>
        Entreprises les plus sollicitées (30 jours)
      </h2>
      {companies.length === 0 ? (
        <p className="text-[17px] leading-[26px] text-ink-deep">Aucune candidature envoyée ces 30 derniers jours.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {companies.map((company, index) => (
            <li key={company.slug}>
              <Link href={adminCompanyPath(company.slug)} className="group flex min-h-14 items-center gap-4 py-3 focus-visible:outline-2 focus-visible:outline-primary">
                <span aria-hidden className="w-6 shrink-0 text-[17px] font-bold text-primary">{index + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[17px] leading-[26px] font-semibold break-words text-ink underline-offset-4 group-hover:underline">{company.name}</span>
                  <span className="text-[15px] leading-[22px] text-muted">
                    {company.city} · {countLabel(company.applications, "candidature", "candidatures")}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Every figure of the dashboard, grouped by subject. */
export function DashboardSections({ stats }: { readonly stats: Stats }) {
  return (
    <div className="flex flex-col gap-10">
      <CandidateStats candidates={stats.candidates} />
      <ActivityStats stats={stats} />
      <CompanyStats companies={stats.companies} />
      <TopCompanies companies={stats.topCompanies} />
    </div>
  );
}
