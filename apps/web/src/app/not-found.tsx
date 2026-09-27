import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { COMPANIES_PATH } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Page introuvable",
  description: "La page que vous cherchez n’existe pas ou a été déplacée.",
};

/** Rendered for every unknown URL. The "404" is typographic (brand orange with a soft offset shadow). */
export default function NotFound() {
  return (
    <section className="bg-white pt-[140px] pb-[60px] tab:pt-[180px] tab:pb-20 desk:pt-[220px] desk:pb-[120px]">
      <Container>
        <Reveal className="flex flex-col items-center text-center">
          <p
            aria-hidden
            className="font-heading text-[110px] leading-none font-extrabold text-primary [text-shadow:10px_8px_0_var(--color-accent-soft)] tab:text-[130px]"
          >
            404
          </p>
          <h1 className="mt-6 text-[36px] leading-[1.2] font-bold tab:mt-[30px] tab:text-[45px] desk:mt-10 desk:text-[56px]">
            Page introuvable
          </h1>
          <p className="mt-2 max-w-[520px] text-[18px] leading-[27px] text-ink-deep">
            La page que vous cherchez n’existe pas ou a été déplacée.
          </p>
          <div className="mt-6 flex flex-col items-center gap-4 tab:mt-[30px] tab:flex-row desk:mt-10">
            <ButtonLink href="/">Retour à l’accueil</ButtonLink>
            <ButtonLink href={COMPANIES_PATH} variant="light" className="shadow-[inset_0_0_0_1px_var(--color-line)]">
              Voir les entreprises
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
