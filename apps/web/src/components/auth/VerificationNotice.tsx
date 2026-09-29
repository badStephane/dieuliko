import { MailWarning } from "lucide-react";
import type { User } from "@/features/auth/auth-api";
import { ResendVerificationForm } from "./AuthForms";

interface VerificationNoticeProps {
  readonly user: User;
  /** Anchor other parts of the page link to. */
  readonly id?: string;
  /** What confirming unlocks, after the address it was sent to. */
  readonly reason?: string;
}

/** Asks to confirm the email address, with a button to send the link again. */
export function VerificationNotice({ user, id, reason }: VerificationNoticeProps) {
  return (
    <div id={id} className="flex scroll-mt-28 flex-col gap-4 rounded-[10px] bg-accent-soft/40 p-6 tab:flex-row tab:items-start">
      <MailWarning aria-hidden className="size-7 shrink-0 text-primary" strokeWidth={1.5} />
      <div className="flex flex-col gap-2">
        <p className="text-[18px] leading-[27px] font-semibold">Confirmez votre adresse email</p>
        <p className="text-[17px] leading-[26px] text-ink-deep">
          Nous avons envoyé un lien à <strong>{user.email}</strong>. Pensez à vérifier vos courriers indésirables.
          {reason ? ` ${reason}` : ""}
        </p>
        <ResendVerificationForm />
      </div>
    </div>
  );
}
