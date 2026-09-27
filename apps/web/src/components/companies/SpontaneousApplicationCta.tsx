import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { COMPANIES_PATH } from "@/lib/navigation";
import { signupHref } from "@/features/signup/company-param";

/** Closing call to action of a company profile, followed by the way back to the directory. */
export function SpontaneousApplicationCta({ name, slug }: { readonly name: string; readonly slug: string }) {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="candidature" className="rounded-[6px] bg-ink px-6 py-8 text-white tab:px-10 tab:py-10">
        <h2 id="candidature" className="text-[28px] leading-[1.2] font-bold text-white tab:text-[36px]">
          Envie de rejoindre {name} ?
        </h2>
        <p className="mt-3 max-w-[560px] text-[18px] leading-[27px] text-white/80">
          Pas besoin d’attendre une offre : envoyez une candidature spontanée. Dieuliko vous aide à préparer votre CV
          et votre lettre de motivation.
        </p>
        <ButtonLink href={signupHref(slug)} className="mt-6 w-full tab:w-auto">
          Postuler spontanément
          <ArrowRight aria-hidden className="size-5" />
        </ButtonLink>
      </section>
      <Link
        href={COMPANIES_PATH}
        className="inline-flex items-center gap-2 self-start text-[18px] leading-[27px] font-semibold text-ink transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ArrowLeft aria-hidden className="size-5" />
        Retour à l’annuaire
      </Link>
    </div>
  );
}
