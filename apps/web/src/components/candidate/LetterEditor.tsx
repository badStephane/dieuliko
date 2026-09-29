"use client";

import { Copy, FileText, PenLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { deleteLetterAction, generateLetterAction, saveLetterAction, type LetterResult } from "@/features/candidate/actions";
import { MAX_LETTER_LENGTH, type Application, type Letter } from "@/features/candidate/candidate-api";
import { blanksLeft, letterTemplate } from "@/features/candidate/letter-template";
import { CANDIDATE_PROFILE_PATH } from "@/features/candidate/paths";
import { formatDate } from "@/lib/format";
import { BUTTON, CARD, ConfirmBox, Feedback, PRIMARY, SECONDARY } from "./ActionControls";
import { AiAssist } from "./AiAssist";
import { ApplyPanel } from "./ApplyPanel";
import { useUnsavedChangesWarning } from "./useUnsavedChangesWarning";

const TEXTAREA_ID = "letter-content";

type Pending = "generate" | "save" | "delete" | null;
type Confirming = "regenerate" | "delete" | null;

interface LetterEditorProps {
  readonly slug: string;
  readonly companyName: string;
  /** Signs the letter template; empty leaves a blank. */
  readonly authorName: string;
  readonly initial: Letter | null;
  /** False when the profile is too empty for the assistant to write from. */
  readonly isProfileReady: boolean;
  /** Titles of the experiences whose missions are not described yet. */
  readonly undescribedExperiences: readonly string[];
  readonly hasCv: boolean;
  /** The application already sent to this company, if any. */
  readonly application: Application | null;
}

/** Points to the experiences with no missions described: without them the letter can only stay vague. */
function MissingMissionsNote({ titles }: { readonly titles: readonly string[] }) {
  if (titles.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-accent-soft/50 p-4 text-[16px] leading-6 text-ink">
      <p>
        {titles.length === 1 ? "Cette expérience n’a pas de missions décrites" : "Ces expériences n’ont pas de missions décrites"} : la lettre
        restera vague sur ce que vous y avez fait.
      </p>
      <ul className="list-disc pl-6">
        {titles.map((title, index) => (
          <li key={index} className="break-words">{title}</li>
        ))}
      </ul>
      <p>
        <Link href={CANDIDATE_PROFILE_PATH} className="font-semibold underline underline-offset-4">
          Décrire mes missions dans mon profil
        </Link>
        , puis revenez rédiger votre lettre.
      </p>
    </div>
  );
}

interface StartPanelProps {
  readonly companyName: string;
  readonly isProfileReady: boolean;
  readonly undescribedExperiences: readonly string[];
  readonly isGenerating: boolean;
  readonly onGenerate: () => void;
  readonly onWrite: () => void;
  readonly onTemplate: () => void;
  readonly status: ReactNode;
  readonly result: LetterResult | null;
}

/** First visit: let the assistant draft the letter, or write it from a template or a blank page. */
function StartPanel({ companyName, isProfileReady, undescribedExperiences, isGenerating, onGenerate, onWrite, onTemplate, status, result }: StartPanelProps) {
  return (
    <section aria-labelledby="letter-start-title" className={CARD}>
      <h2 id="letter-start-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
        Votre lettre pour {companyName}
      </h2>
      <p className="text-[17px] leading-[26px] text-ink-deep">
        L’assistant rédige une première version à partir de votre profil et de la fiche de l’entreprise. Vous préférez écrire vous-même ? Partez de notre
        modèle : il suffit de remplacer les passages entre crochets, puis l’assistant peut relire votre texte.
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
      {isProfileReady && <MissingMissionsNote titles={undescribedExperiences} />}
      <div className="flex flex-col gap-3 tab:flex-row">
        <button type="button" onClick={onGenerate} disabled={isGenerating} className={PRIMARY}>
          <Sparkles aria-hidden className={`size-5 ${isGenerating ? "motion-safe:animate-pulse" : ""}`} />
          {isGenerating ? "Rédaction en cours…" : "Rédiger ma lettre avec l’IA"}
        </button>
        <button type="button" onClick={onTemplate} disabled={isGenerating} className={SECONDARY}>
          <FileText aria-hidden className="size-5" />
          Partir d’un modèle
        </button>
        <button type="button" onClick={onWrite} disabled={isGenerating} className={SECONDARY}>
          <PenLine aria-hidden className="size-5" />
          Page blanche
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
export function LetterEditor({ slug, companyName, authorName, initial, isProfileReady, undescribedExperiences, hasCv, application }: LetterEditorProps) {
  const [letter, setLetter] = useState<Letter | null>(initial);
  const [content, setContent] = useState(initial?.content ?? "");
  const [isEditing, setIsEditing] = useState(initial !== null);
  const [result, setResult] = useState<LetterResult | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();
  const isDirty = content !== (letter?.content ?? "");
  const blanks = blanksLeft(content);
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

  const editor = !isEditing ? (
    <StartPanel
      companyName={companyName}
      isProfileReady={isProfileReady}
      undescribedExperiences={undescribedExperiences}
      isGenerating={pending === "generate"}
      onGenerate={generate}
      onWrite={() => setIsEditing(true)}
      onTemplate={() => {
        setContent(letterTemplate({ companyName, authorName }));
        setIsEditing(true);
      }}
      status={status}
      result={result}
    />
  ) : (
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
      {blanks > 0 && (
        <p className="-mt-2 rounded-[10px] bg-accent-soft/50 p-4 text-[16px] leading-6 text-ink">
          {blanks === 1 ? "Il reste 1 passage entre crochets à remplacer" : `Il reste ${blanks} passages entre crochets à remplacer`} avant d’envoyer
          votre candidature.
        </p>
      )}
      {content.trim() !== "" && (
        <AiAssist
          kind="letter"
          text={content}
          onAccept={setContent}
          hint="L’assistant corrige la langue et le style de votre texte, sans rien y ajouter. Les passages entre crochets restent à remplir."
        />
      )}

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

  return (
    <>
      {editor}
      <ApplyPanel
        slug={slug}
        companyName={companyName}
        isProfileReady={isProfileReady}
        hasCv={hasCv}
        hasSavedLetter={letter !== null}
        hasUnsavedChanges={isEditing && isDirty}
        initial={application}
      />
    </>
  );
}
