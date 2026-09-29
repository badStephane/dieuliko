"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type DragEvent } from "react";
import { BUTTON, Feedback, SECONDARY, type ActionFeedback } from "@/components/candidate/ActionControls";
import { CompanyAvatar } from "@/components/companies/CompanyAvatar";
import { removeCompanyLogoAction, uploadCompanyLogoAction } from "@/features/admin/actions";
import { adminLogoUrl } from "@/features/admin/paths";
import { LOGO_TYPES, logoFileError } from "@/features/companies/logo";

interface LogoFieldProps {
  readonly slug: string;
  readonly name: string;
  readonly sector: string;
  readonly logoVersion: string | null;
}

const ACCEPT = LOGO_TYPES.join(",");

/**
 * The listing's logo: dropped or picked, it is previewed at once and saved right away (it is not part of the form's
 * unsaved changes). Without a logo the directory shows the name's monogram.
 */
export function LogoField({ slug, name, sector, logoVersion }: LogoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ActionFeedback | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const shown = preview ?? (logoVersion ? adminLogoUrl(slug, logoVersion) : null);

  function upload(file: File | undefined) {
    const problem = logoFileError(file);
    if (problem || !file) {
      setResult({ status: "error", message: problem ?? "" });
      return;
    }
    setPreview(URL.createObjectURL(file));
    const form = new FormData();
    form.append("file", file);
    startTransition(async () => {
      const outcome = await uploadCompanyLogoAction(slug, form);
      setResult(outcome);
      setPreview(null); // the refreshed page now carries the new version, or the old logo comes back
    });
  }

  function remove() {
    startTransition(async () => setResult(await removeCompanyLogoAction(slug)));
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!isPending) upload(event.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={drop}
        className={`flex flex-col items-center gap-4 rounded-[12px] border-2 border-dashed p-5 text-center transition-colors duration-150 tab:flex-row tab:text-left ${
          isDragging ? "border-primary bg-accent-soft/60" : "border-line bg-surface/50"
        }`}
      >
        <CompanyAvatar company={{ name, sector, logoUrl: shown }} size="lg" className={isPending ? "opacity-60" : ""} />
        <div className="flex flex-1 flex-col gap-3">
          <p id={hintId} className="text-[15px] leading-[22px] text-muted">
            Glissez une image ici ou choisissez un fichier. PNG, JPEG ou WebP, 2 Mo maximum ; idéalement carrée, sur fond
            blanc ou transparent.
          </p>
          <div className="flex flex-wrap justify-center gap-2 tab:justify-start">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isPending}
              aria-describedby={hintId}
              className={`${BUTTON} min-h-11 bg-ink text-white hover:bg-primary`}
            >
              <ImagePlus aria-hidden className="size-5" />
              {isPending ? "Envoi…" : logoVersion ? "Remplacer le logo" : "Ajouter un logo"}
            </button>
            {logoVersion && (
              <button type="button" onClick={remove} disabled={isPending} className={`${SECONDARY} min-h-11`}>
                <Trash2 aria-hidden className="size-5" />
                Retirer
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              upload(event.target.files?.[0]);
              event.target.value = ""; // picking the same file again still triggers a change
            }}
          />
        </div>
      </div>
      <Feedback result={result} />
    </div>
  );
}
