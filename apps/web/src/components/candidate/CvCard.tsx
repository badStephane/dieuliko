"use client";

import { Download, FileText, FileUp, Upload } from "lucide-react";
import { useActionState, useRef, useState, type ChangeEvent } from "react";
import { FormMessage } from "@/components/auth/FormParts";
import { IDLE, type FormState } from "@/features/auth/form-state";
import { deleteCvAction, uploadCvAction } from "@/features/candidate/actions";
import type { Cv } from "@/features/candidate/candidate-api";
import { CV_DOWNLOAD_PATH } from "@/features/candidate/paths";
import { checkCvFile } from "@/features/candidate/profile-form";
import { formatDate, formatFileSize } from "@/lib/format";

const FILE_INPUT_ID = "cv-file";
const FOCUS_CLASSES = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const PRIMARY_CLASSES = `inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[8px] bg-primary px-5 text-[17px] font-semibold text-white transition-colors duration-150 hover:bg-ink active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 ${FOCUS_CLASSES}`;
const SECONDARY_CLASSES = `inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[8px] px-5 text-[17px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors duration-150 hover:bg-surface active:scale-[0.98] ${FOCUS_CLASSES}`;
/** The file input is visually hidden: its label is the button, and shows the focus ring instead. */
const LABEL_FOCUS_CLASSES = "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary";

/** Picks a PDF, checks it locally, then uploads it on confirmation. */
function UploadForm({ hasCv }: { readonly hasCv: boolean }) {
  const [chosen, setChosen] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, isPending] = useActionState(async (previous: FormState, formData: FormData) => {
    const next = await uploadCvAction(previous, formData);
    if (next.status === "success") cancel(); // the new CV now shows above: clear the picked file
    return next;
  }, IDLE);

  function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const problem = file ? checkCvFile(file) : undefined;
    setLocalError(problem);
    setChosen(problem ? null : file);
    if (problem) event.target.value = "";
  }

  function cancel() {
    formRef.current?.reset();
    setChosen(null);
  }

  const error = localError ?? (state.status === "error" ? (state.fields?.file ?? state.message) : undefined);
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      {chosen ? (
        <div className="flex flex-col gap-3 rounded-[10px] bg-surface p-4 tab:flex-row tab:items-center tab:justify-between">
          <p className="text-[16px] leading-6 text-ink-deep">
            <span className="font-semibold break-all text-ink">{chosen.name}</span> · {formatFileSize(chosen.size)}
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className={PRIMARY_CLASSES}>
              <Upload aria-hidden className="size-5" />
              {isPending ? "Envoi…" : "Envoyer"}
            </button>
            {!isPending && (
              <button type="button" onClick={cancel} className={SECONDARY_CLASSES}>
                Annuler
              </button>
            )}
          </div>
        </div>
      ) : (
        <label htmlFor={FILE_INPUT_ID} className={`${hasCv ? SECONDARY_CLASSES : PRIMARY_CLASSES} ${LABEL_FOCUS_CLASSES} self-start`}>
          <FileUp aria-hidden className="size-5" />
          {hasCv ? "Remplacer le CV" : "Choisir mon CV (PDF)"}
        </label>
      )}
      <input
        id={FILE_INPUT_ID}
        name="file"
        type="file"
        accept="application/pdf,.pdf"
        onChange={onChoose}
        aria-describedby={`${FILE_INPUT_ID}-hint${error ? ` ${FILE_INPUT_ID}-error` : ""}`}
        className="sr-only"
      />
      <p id={`${FILE_INPUT_ID}-hint`} className="text-[15px] leading-[22px] text-muted">
        Format PDF, 5 Mo maximum.
      </p>
      {error && (
        <p id={`${FILE_INPUT_ID}-error`} role="alert" className="text-[15px] leading-[22px] text-red-700">
          {error}
        </p>
      )}
      {!error && state.status === "success" && <FormMessage state={state} />}
    </form>
  );
}

/** Deleting asks for confirmation inline: a CV is costly to lose on a slow connection. */
function DeleteForm() {
  const [state, action, isPending] = useActionState(deleteCvAction, IDLE);
  const [isConfirming, setIsConfirming] = useState(false);
  if (!isConfirming) {
    return (
      <button type="button" onClick={() => setIsConfirming(true)} className={`min-h-11 cursor-pointer self-start text-[16px] font-semibold text-red-700 underline-offset-4 hover:underline ${FOCUS_CLASSES}`}>
        Supprimer le CV
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[10px] bg-red-50 p-4">
      <p className="text-[16px] leading-6 text-ink">Supprimer définitivement votre CV ?</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending} className={`inline-flex min-h-11 cursor-pointer items-center rounded-[8px] bg-red-700 px-4 text-[16px] font-semibold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-70 ${FOCUS_CLASSES}`}>
          {isPending ? "Suppression…" : "Oui, supprimer"}
        </button>
        <button type="button" onClick={() => setIsConfirming(false)} className={SECONDARY_CLASSES}>
          Garder mon CV
        </button>
      </div>
      {state.status === "error" && <FormMessage state={state} />}
    </form>
  );
}

function CvDetails({ cv }: { readonly cv: Cv }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <FileText aria-hidden className="mt-1 size-8 shrink-0 text-primary" strokeWidth={1.5} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[17px] leading-[26px] font-semibold break-all text-ink">{cv.fileName}</p>
          <p className="text-[15px] leading-[22px] text-muted">
            {formatFileSize(cv.sizeBytes)} · envoyé le {formatDate(cv.uploadedAt)}
          </p>
        </div>
      </div>
      <a href={CV_DOWNLOAD_PATH} download className={`${SECONDARY_CLASSES} self-start`}>
        <Download aria-hidden className="size-5" />
        Télécharger
      </a>
    </div>
  );
}

/**
 * The candidate's CV: an empty state with a clear first action, or the current file and what to do with it.
 * The upload form keeps its place in both states, so its confirmation survives the refresh after an upload.
 */
export function CvCard({ cv }: { readonly cv: Cv | null }) {
  return (
    <section aria-labelledby="cv-title" className="flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8">
      <h2 id="cv-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
        Mon CV
      </h2>
      {cv ? (
        <CvDetails cv={cv} />
      ) : (
        <p className="text-[17px] leading-[26px] text-ink-deep">Ajoutez votre CV : il sera joint à vos candidatures spontanées.</p>
      )}
      <UploadForm hasCv={cv !== null} />
      {cv && <DeleteForm />}
    </section>
  );
}
