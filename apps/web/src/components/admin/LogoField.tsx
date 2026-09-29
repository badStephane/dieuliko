"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { BUTTON, Feedback, SECONDARY, type ActionFeedback } from "@/components/candidate/ActionControls";
import { CompanyAvatar } from "@/components/companies/CompanyAvatar";
import { removeCompanyLogoAction, uploadCompanyLogoAction } from "@/features/admin/actions";
import { adminLogoUrl } from "@/features/admin/paths";
import { LOGO_TYPES, logoFileError } from "@/features/companies/logo";

const ACCEPT = LOGO_TYPES.join(",");

interface LogoDropZoneProps {
  readonly name: string;
  readonly sector: string;
  /** The image shown, or null for the name's monogram. */
  readonly shownUrl: string | null;
  readonly isBusy: boolean;
  readonly onPick: (file: File | undefined) => void;
  /** Offered when there is a logo to take off. */
  readonly onRemove?: () => void;
}

/** Drop zone and buttons of a logo; what happens to the file is up to the caller. */
export function LogoDropZone({ name, sector, shownUrl, isBusy, onPick, onRemove }: LogoDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [isDragging, setIsDragging] = useState(false);

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!isBusy) onPick(event.dataTransfer.files[0]);
  }

  return (
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
      <CompanyAvatar company={{ name: name || "?", sector, logoUrl: shownUrl }} size="lg" className={isBusy ? "opacity-60" : ""} />
      <div className="flex flex-1 flex-col gap-3">
        <p id={hintId} className="text-[15px] leading-[22px] text-muted">
          Glissez une image ici ou choisissez un fichier. PNG, JPEG ou WebP, 2 Mo maximum ; idéalement carrée, sur fond blanc
          ou transparent.
        </p>
        <div className="flex flex-wrap justify-center gap-2 tab:justify-start">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            aria-describedby={hintId}
            className={`${BUTTON} min-h-11 bg-ink text-white hover:bg-primary`}
          >
            <ImagePlus aria-hidden className="size-5" />
            {isBusy ? "Envoi…" : shownUrl ? "Remplacer le logo" : "Ajouter un logo"}
          </button>
          {onRemove && (
            <button type="button" onClick={onRemove} disabled={isBusy} className={`${SECONDARY} min-h-11`}>
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
            onPick(event.target.files?.[0]);
            event.target.value = ""; // picking the same file again still triggers a change
          }}
        />
      </div>
    </div>
  );
}

/** A local preview URL of `file`, revoked when the file changes or the component leaves. */
export function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

interface LogoFieldProps {
  readonly slug: string;
  readonly name: string;
  readonly sector: string;
  readonly logoVersion: string | null;
}

/**
 * The listing's logo: dropped or picked, it is previewed at once and saved right away (it is not part of the form's
 * unsaved changes). Without a logo the directory shows the name's monogram.
 */
export function LogoField({ slug, name, sector, logoVersion }: LogoFieldProps) {
  const [sending, setSending] = useState<File | null>(null);
  const preview = useObjectUrl(sending);
  const [result, setResult] = useState<ActionFeedback | null>(null);
  const [isPending, startTransition] = useTransition();

  function upload(file: File | undefined) {
    const problem = logoFileError(file);
    if (problem || !file) {
      setResult({ status: "error", message: problem ?? "" });
      return;
    }
    setSending(file);
    const form = new FormData();
    form.append("file", file);
    startTransition(async () => {
      setResult(await uploadCompanyLogoAction(slug, form));
      setSending(null); // the refreshed page now carries the new version, or the old logo comes back
    });
  }

  function remove() {
    startTransition(async () => setResult(await removeCompanyLogoAction(slug)));
  }

  return (
    <div className="flex flex-col gap-4">
      <LogoDropZone
        name={name}
        sector={sector}
        shownUrl={preview ?? (logoVersion ? adminLogoUrl(slug, logoVersion) : null)}
        isBusy={isPending}
        onPick={upload}
        onRemove={logoVersion ? remove : undefined}
      />
      <Feedback result={result} />
    </div>
  );
}
