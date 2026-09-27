"use client"; // Error boundaries must be Client Components.

import { BUTTON_BASE_CLASSES, ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";

interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}

/** Shown when a page fails to render (e.g. the company directory API is unreachable). */
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  return (
    <section className="bg-white pt-[140px] pb-[60px] tab:pt-[180px] tab:pb-20 desk:pt-[220px] desk:pb-[120px]">
      <Container>
        <div className="flex flex-col items-center text-center">
          <h1 className="text-[36px] leading-[1.2] font-bold tab:text-[45px] desk:text-[56px]">
            Un souci est survenu
          </h1>
          <p className="mt-2 max-w-[520px] text-[18px] leading-[27px] text-ink-deep">
            Cette page n’a pas pu être chargée. Réessayez dans quelques instants.
          </p>
          {error.digest ? <p className="mt-2 text-[14px] text-ink-deep/70">Référence : {error.digest}</p> : null}
          <div className="mt-6 flex flex-col items-center gap-4 tab:mt-[30px] tab:flex-row desk:mt-10">
            <button
              type="button"
              onClick={retry}
              className={`${BUTTON_BASE_CLASSES} cursor-pointer bg-primary text-white hover:bg-ink`}
            >
              Réessayer
            </button>
            <ButtonLink href="/" variant="light" className="shadow-[inset_0_0_0_1px_var(--color-line)]">
              Retour à l’accueil
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
