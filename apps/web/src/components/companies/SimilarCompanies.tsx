import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Container } from "@/components/ui/Container";
import type { Company } from "@/features/companies/company";
import { directoryHref } from "@/features/companies/search-params";
import { getSectorLabel } from "@/features/companies/sectors";
import { CompanyCard } from "./CompanyCard";

interface SimilarCompaniesProps {
  readonly sector: string;
  readonly companies: readonly Company[];
}

/** « Entreprises similaires »: same sector, same city first. Hidden when there is none. */
export function SimilarCompanies({ sector, companies }: SimilarCompaniesProps) {
  if (companies.length === 0) return null;

  return (
    <section aria-labelledby="entreprises-similaires" className="bg-surface py-[60px] tab:py-20 desk:py-[120px]">
      <Container>
        <div className="flex flex-col gap-5 tab:flex-row tab:items-end tab:justify-between">
          <SectionHeading eyebrow={getSectorLabel(sector)} title={<span id="entreprises-similaires">Entreprises similaires</span>} />
          <Link
            href={directoryHref({ sector })}
            className="inline-flex shrink-0 items-center gap-2 text-[18px] leading-[27px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Tout le secteur
            <ArrowRight aria-hidden className="size-5" />
          </Link>
        </div>
        <ul className="mt-8 grid grid-cols-1 gap-4 tab:mt-10 tab:grid-cols-2 tab:gap-5 desk:mt-[50px] desk:grid-cols-3 desk:gap-[30px] tab:[&>li:nth-child(3)]:hidden desk:[&>li:nth-child(3)]:block">
          {companies.map((company) => (
            <li key={company.slug}>
              <CompanyCard company={company} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
