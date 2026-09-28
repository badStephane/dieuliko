"use client";

import { AlertCircle, CheckCircle2, Copy, PenLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { deleteLetterAction, generateLetterAction, saveLetterAction, type LetterResult } from "@/features/candidate/actions";
import { MAX_LETTER_LENGTH, type Letter } from "@/features/candidate/candidate-api";
import { CANDIDATE_PROFILE_PATH } from "@/features/candidate/paths";
import { formatDate } from "@/lib/format";
import { useUnsavedChangesWarning } from "./useUnsavedChangesWarning";

const TEXTAREA_ID = "letter-content";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const BUTTON = `inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[8px] px-5 text-[17px] font-semibold transition-colors duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const PRIMARY = `${BUTTON} bg-primary text-white hover:bg-ink`;
const SECONDARY = `${BUTTON} text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-surface`;
const CARD = "flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8";

type Pending = "generate" | "save" | "delete" | null;
type Confirming = "regenerate" | "delete" | null;

interface LetterEditorProps {
  readonly slug: string;
  readonly companyName: string;
  readonly initial: Letter | null;
  /** False when the profile is too empty for the assistant to write from. */
  readonly isProfileReady: boolean;
}

function Feedback({ result }: { readonly result: LetterResult | null }) {
  if (!result || (result.status === "success" && !result.message)) return null;
  const isError = result.status === "error";
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <p className={`flex items-start gap-2 text-[16px] leading-6 ${isError ? "text-red-700" : "text-ink"}`}>
      <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${isError ? "" : "text-primary"}`} />
      {result.message}
    </p>
  );
}

interface ConfirmBoxProps {
  readonly question: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly danger?: boolean;
}

function ConfirmBox({ question, confirmLabel, onConfirm, onCancel, danger }: ConfirmBoxProps) {
  return (
    <div role="group" aria-label={question} className={`flex flex-col gap-3 rounded-[10px] p-4 ${danger ? "bg-red-50" : "bg-accent-soft/50"}`}>
      <p className="text-[16px] leading-6 text-ink">{question}</p>
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

interface StartPanelProps {
  readonly companyName: string;
  readonly isProfileReady: boolean;
  readonly isGenerating: boolean;
  readonly onGenerate: () => void;
  readonly onWrite: () => void;
  readonly status: ReactNode;
  readonly result: LetterResult | null;
}

/** First visit: let the assistant draft the letter, or start from a blank page. */
function StartPanel({ companyName, isProfileReady, isGenerating, onGenerate, onWrite, status, result }: StartPanelProps) {
  return (
    <section aria-labelledby="letter-start-title" className={CARD}>
      <h2 id="letter-start-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
        Votre lettre pour {companyName}
      </h2>
      <p className="text-[17px] leading-[26px] text-ink-deep">
        L’assistant rédige une première version à partir de votre profil et de la fiche de l’entreprise. Vous la relisez, la modifiez, puis l’enregistrez.
      </p>
      {!isProfileReady && (
        <p className="rounded-[10px] bg-accent-soft/50 p-4 text-[16px] leading-6 text-ink">
          Votre profil est encore presque vide : la lettre sera bien meilleure une fois{" "}
          <Link href={CANDIDATE_PROFILE_PATH} className="font-semibold underline underline-offset-4">
            votre profil complété
          </Link>
          .
        </p>
      )}
      <div className="flex flex-col gap-3 tab:flex-row">
        <button type="button" onClick={onGenerate} disabled={isGenerating} className={PRIMARY}>
          <Sparkles aria-hidden className={`size-5 ${isGenerating ? "motion-safe:animate-pulse" : ""}`} />
          {isGenerating ? "Rédaction en cours…" : "Rédiger ma lettre avec l’IA"}
        </button>
        <button type="button" onClick={onWrite} disabled={isGenerating} className={SECONDARY}>
          <PenLine aria-hidden className="size-5" />
          Écrire moi-même
        </button>
      </div>
      <p role="status" aria-live="polite" className="text-[16px] leading-6 text-muted">
        {status}
      </p>
      <Feedback result={result} />
    </section>
  );
}

/** Drafts, edits and saves the candidate's cover letter for one company. */
export function LetterEditor({ slug, companyName, initial, isProfileReady }: LetterEditorProps) {
  const [letter, setLetter] = useState<Letter | null>(initial);
  const [content, setContent] = useState(initial?.content ?? "");
  const [isEditing, setIsEditing] = useState(initial !== null);
  const [result, setResult] = useState<LetterResult | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();
  const isDirty = content !== (letter?.content ?? "");
  useUnsavedChangesWarning(isDirty);

  function run(kind: Exclude<Pending, null>, action: () => Promise<LetterResult>) {
    setConfirming(null);
    setCopied(false);
    setPending(kind);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      setPending(null);
      if (outcome.status !== "success") return;
      const next = kind === "delete" ? null : (outcome.letter ?? null);
      setLetter(next);
      setContent(next?.content ?? "");
      setIsEditing(next !== null);
    });
  }

  const generate = () => run("generate", () => generateLetterAction(slug));

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch {
      setResult({ status: "error", message: "La copie n’a pas fonctionné : sélectionnez le texte puis copiez-le." });
    }
  }

  let status: ReactNode = null;
  if (pending === "generate") status = "L’assistant rédige votre lettre, cela prend quelques secondes…";
  else if (pending === "save") status = "Enregistrement…";
  else if (pending === "delete") status = "Suppression…";
  else if (copied) status = "Lettre copiée.";
  else if (isDirty && letter) status = "Modifications non enregistrées";
  else if (letter && result?.status !== "error") status = `Enregistrée le ${formatDate(letter.updatedAt)}.`;

  if (!isEditing) {
    return (
      <StartPanel
        companyName={companyName}
        isProfileReady={isProfileReady}
        isGenerating={pending === "generate"}
        onGenerate={generate}
        onWrite={() => setIsEditing(true)}
        status={status}
        result={result}
      />
    );
  }

  return (
    <section aria-labelledby="letter-title" className={CARD}>
      <div className="flex flex-col gap-1.5">
        <label id="letter-title" htmlFor={TEXTAREA_ID} className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
          Votre lettre pour {companyName}
        </label>
        <p id={`${TEXTAREA_ID}-hint`} className="text-[15px] leading-[22px] text-muted">
          Relisez-la et adaptez-la : l’IA peut se tromper, et votre ton personnel fait la différence.
        </p>
      </div>
      <textarea
        id={TEXTAREA_ID}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={18}
        maxLength={MAX_LETTER_LENGTH}
        aria-describedby={`${TEXTAREA_ID}-hint ${TEXTAREA_ID}-count`}
        disabled={pending === "generate"}
        className="w-full resize-y rounded-[8px] bg-white px-4 py-3 text-[17px] leading-[27px] text-ink-deep shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)] disabled:opacity-60"
      />
      <p id={`${TEXTAREA_ID}-count`} className="-mt-3 self-end text-[14px] leading-5 text-muted">
        {[...content].length} / {MAX_LETTER_LENGTH}
      </p>

      {confirming === "regenerate" && (
        <ConfirmBox question="Remplacer votre lettre actuelle par une nouvelle version de l’assistant ?" confirmLabel="Oui, nouvelle version" onConfirm={generate} onCancel={() => setConfirming(null)} />
      )}
      {confirming === "delete" && (
        <ConfirmBox question="Supprimer définitivement cette lettre ?" confirmLabel="Oui, supprimer" danger onConfirm={() => run("delete", () => deleteLetterAction(slug))} onCancel={() => setConfirming(null)} />
      )}

      <div className="flex flex-col gap-3 tab:flex-row tab:flex-wrap">
        <button type="button" onClick={() => run("save", () => saveLetterAction(slug, content))} disabled={pending !== null || !isDirty} className={PRIMARY}>
          {pending === "save" ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={copy} disabled={content.trim() === ""} className={SECONDARY}>
          <Copy aria-hidden className="size-5" />
          Copier
        </button>
        <button type="button" onClick={() => (content.trim() ? setConfirming("regenerate") : generate())} disabled={pending !== null} className={SECONDARY}>
          <Sparkles aria-hidden className={`size-5 ${pending === "generate" ? "motion-safe:animate-pulse" : ""}`} />
          {pending === "generate" ? "Rédaction en cours…" : "Nouvelle version avec l’IA"}
        </button>
        {letter && (
          <button type="button" onClick={() => setConfirming("delete")} disabled={pending !== null} className={`${BUTTON} text-red-700 hover:bg-red-50`}>
            Supprimer
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className="min-h-6 text-[16px] leading-6 text-muted">
        {status}
      </p>
      <Feedback result={result} />
    </section>
  );
}
