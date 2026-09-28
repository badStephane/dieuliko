"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { improveTextAction, type ImproveResult } from "@/features/candidate/actions";
import type { RewriteInput } from "@/features/candidate/candidate-api";

const FOCUS_CLASSES = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const SMALL_BUTTON = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[8px] px-4 text-[16px] font-semibold transition-colors duration-150 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 ${FOCUS_CLASSES}`;

interface AiAssistProps {
  readonly kind: RewriteInput["kind"];
  /** Current text of the field; empty means "write it for me". */
  readonly text: string;
  readonly title?: string;
  readonly organization?: string;
  /** Puts the accepted proposal in the field. */
  readonly onAccept: (text: string) => void;
  /** Extra line under the button (e.g. what the assistant draws on). */
  readonly hint?: string;
}

/** Asks the writing assistant for a proposal, which the candidate reads, then keeps or discards. */
export function AiAssist({ kind, text, title = "", organization = "", onAccept, hint }: AiAssistProps) {
  const [result, setResult] = useState<ImproveResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const proposalRef = useRef<HTMLDivElement>(null);
  const proposal = result?.status === "success" ? result.text : null;

  // A new proposal takes the focus, so screen-reader and keyboard users land on it, and scrolls until its
  // buttons clear the sticky save bar (scroll-margin below).
  useEffect(() => {
    if (!proposal) return;
    proposalRef.current?.focus({ preventScroll: true });
    proposalRef.current?.scrollIntoView({ block: "end" });
  }, [proposal]);

  function request() {
    startTransition(async () => {
      setResult(await improveTextAction({ kind, text, title, organization }));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {proposal ? (
        <div ref={proposalRef} tabIndex={-1} role="group" aria-label="Proposition de l’assistant" className={`flex scroll-mb-44 flex-col gap-3 rounded-[10px] bg-accent-soft/50 p-4 tab:scroll-mb-32 ${FOCUS_CLASSES}`}>
          <p className="flex items-center gap-2 text-[15px] leading-[22px] font-semibold text-ink">
            <Sparkles aria-hidden className="size-4 text-primary-deep" strokeWidth={2} />
            Proposition de l’assistant
          </p>
          <p className="text-[17px] leading-[26px] whitespace-pre-line text-ink-deep">{proposal}</p>
          <p className="text-[14px] leading-5 text-muted">Relisez-la avant de la garder : l’IA peut se tromper.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onAccept(proposal);
                setResult(null);
              }}
              className={`${SMALL_BUTTON} bg-ink text-white hover:bg-primary`}
            >
              Remplacer mon texte
            </button>
            <button type="button" onClick={() => setResult(null)} className={`${SMALL_BUTTON} text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-white`}>
              Garder le mien
            </button>
            <button type="button" onClick={request} disabled={isPending} className={`${SMALL_BUTTON} text-ink underline-offset-4 hover:underline`}>
              {isPending ? "Rédaction…" : "Autre proposition"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={request}
          disabled={isPending}
          className={`${SMALL_BUTTON} self-start text-ink shadow-[inset_0_0_0_1px_var(--color-primary)] hover:bg-accent-soft`}
        >
          <Sparkles aria-hidden className={`size-5 text-primary-deep ${isPending ? "motion-safe:animate-pulse" : ""}`} strokeWidth={1.75} />
          {isPending ? "Rédaction en cours…" : text.trim() ? "Améliorer avec l’IA" : "Rédiger avec l’IA"}
        </button>
      )}
      {hint && !proposal && <p className="text-[14px] leading-5 text-muted">{hint}</p>}
      {result?.status === "error" && (
        <p role="alert" className="text-[15px] leading-[22px] text-red-700">
          {result.message}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {isPending ? "L’assistant rédige une proposition." : ""}
      </p>
    </div>
  );
}
