"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useId } from "react";

/** Buttons and cards shared by the candidate's letter and application tools. */
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
export const BUTTON = `inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[8px] px-5 text-[17px] font-semibold transition-colors duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const PRIMARY = `${BUTTON} bg-primary text-white hover:bg-ink`;
export const SECONDARY = `${BUTTON} text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-surface`;
export const CARD = "flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8";

/** A server action's outcome, as shown under the controls. */
export type ActionFeedback = { readonly status: "success"; readonly message?: string } | { readonly status: "error"; readonly message: string };

/** The outcome, in a live region that is always rendered so screen readers announce every new message. */
export function Feedback({ result }: { readonly result: ActionFeedback | null }) {
  const isShown = result !== null && (result.status === "error" || Boolean(result.message));
  const isError = result?.status === "error";
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    // While empty it is taken out of the flow (sr-only), so it adds no gap, yet stays in the accessibility tree.
    <div role="status" aria-live="polite" className="empty:sr-only">
      {isShown && (
        <p className={`flex items-start gap-2 text-[16px] leading-6 ${isError ? "text-red-700" : "text-ink"}`}>
          <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${isError ? "" : "text-primary"}`} />
          {result.message}
        </p>
      )}
    </div>
  );
}

interface ConfirmBoxProps {
  readonly question: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly danger?: boolean;
}

/** Inline confirmation for an action that cannot be undone. */
export function ConfirmBox({ question, confirmLabel, onConfirm, onCancel, danger }: ConfirmBoxProps) {
  const questionId = useId();
  return (
    <div role="group" aria-labelledby={questionId} className={`flex flex-col gap-3 rounded-[10px] p-4 ${danger ? "bg-red-50" : "bg-accent-soft/50"}`}>
      <p id={questionId} className="text-[16px] leading-6 text-ink">
        {question}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onConfirm} className={`${BUTTON} min-h-11 ${danger ? "bg-red-700 text-white hover:bg-red-800" : "bg-ink text-white hover:bg-primary"}`}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className={`${SECONDARY} min-h-11`}>
          Annuler
        </button>
      </div>
    </div>
  );
}
