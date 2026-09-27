import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

interface AuthPanelProps {
  readonly title: string;
  readonly intro?: ReactNode;
  readonly children: ReactNode;
  /** Links under the card ("Pas encore de compte ? …"). */
  readonly footer?: ReactNode;
}

/** Narrow card holding an account form, under the page banner. */
export function AuthPanel({ title, intro, children, footer }: AuthPanelProps) {
  return (
    <section className="bg-white pt-[60px] pb-[60px] tab:pt-20 tab:pb-20 desk:pt-[100px] desk:pb-[120px]">
      <Container>
        <div className="mx-auto flex max-w-[560px] flex-col gap-6">
          <div className="rounded-[10px] bg-surface p-[30px] tab:p-10">
            <h2 className="text-[28px] leading-[1.25] font-bold tab:text-[32px]">{title}</h2>
            {intro && <div className="mt-3 text-[18px] leading-[27px] text-ink-deep">{intro}</div>}
            <div className="mt-8">{children}</div>
          </div>
          {footer && <div className="text-center text-[17px] leading-[26px] text-ink-deep">{footer}</div>}
        </div>
      </Container>
    </section>
  );
}

/** Inline text link styled like the rest of the site. */
export const AUTH_LINK_CLASSES = "font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline";
