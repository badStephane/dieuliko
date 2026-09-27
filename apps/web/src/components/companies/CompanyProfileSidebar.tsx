import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Company } from "@/features/companies/company";
import { buildCompanySummary, SIZE_LABELS, telHref } from "@/features/companies/profile";
import { signupHref } from "@/features/signup/company-param";
import { CompanyAvatar } from "./CompanyAvatar";

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-[16px] leading-[24px]">
      <dt className="shrink-0 text-ink-deep">{label}</dt>
      <dd className="min-w-0 text-right break-words text-ink">{children}</dd>
    </div>
  );
}

/** Grey summary card next to the sections (old job sidebar): identity, key facts, contact and CTA. */
export function CompanyProfileSidebar({ company }: { readonly company: Company }) {
  const [intro] = buildCompanySummary(company);

  return (
    <div className="rounded-[6px] bg-soft p-6 tab:p-10">
      <div className="flex items-center gap-4">
        <CompanyAvatar company={company} size="sm" />
        <p className="font-heading text-[22px] leading-[1.3] font-bold text-ink">{company.name}</p>
      </div>
      {intro && <p className="mt-5 text-[16px] leading-[24px] text-ink-deep">{intro}</p>}
      <dl className="mt-5 border-t border-line pt-3">
        <Row label="Ville">{company.city}</Row>
        {company.size && <Row label="Taille">{SIZE_LABELS[company.size]}</Row>}
        {company.phone && (
          <Row label="Téléphone">
            <a href={telHref(company.phone)} className="hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
              {company.phone}
            </a>
          </Row>
        )}
        {company.email && (
          <Row label="E-mail">
            <a href={`mailto:${company.email}`} className="hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
              {company.email}
            </a>
          </Row>
        )}
      </dl>
      <Link
        href={signupHref(company.slug)}
        className="mt-6 flex h-[57px] w-full items-center justify-center gap-2.5 rounded-full bg-primary px-6 text-[18px] leading-[27px] font-semibold text-white transition-colors duration-300 hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Postuler spontanément
        <ArrowRight aria-hidden className="size-5" />
      </Link>
    </div>
  );
}
