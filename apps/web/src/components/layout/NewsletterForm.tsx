"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormStatus = "idle" | "invalid" | "success";

const STATUS_MESSAGES: Record<Exclude<FormStatus, "idle">, string> = {
  invalid: "Veuillez saisir une adresse e-mail valide.",
  success: "Merci, votre inscription est bien prise en compte.",
};

interface NewsletterFormProps {
  readonly className?: string;
}

/** Footer newsletter field. Client-side validation only — no backend is wired yet. */
export function NewsletterForm({ className = "" }: NewsletterFormProps) {
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!EMAIL_PATTERN.test(email)) {
      setStatus("invalid");
      return;
    }
    event.currentTarget.reset();
    setStatus("success");
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={className}>
      <div className="flex h-14 overflow-hidden rounded-[10px]">
        <label htmlFor="newsletter-email" className="sr-only">
          Adresse e-mail
        </label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          placeholder="votre@email.com"
          onChange={() => setStatus("idle")}
          className="min-w-0 flex-1 rounded-l-[10px] border border-r-0 border-white/10 bg-white/5 px-4 text-[16px] leading-6 text-white placeholder:text-white/70 focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          aria-label="S’inscrire à la newsletter"
          className="flex w-14 shrink-0 items-center justify-center bg-primary text-white transition-colors hover:bg-primary-deep"
        >
          <ArrowRight className="size-6" strokeWidth={2} />
        </button>
      </div>
      {status !== "idle" && (
        <p role="status" className={`mt-2 text-[14px] ${status === "success" ? "text-accent-soft" : "text-red-300"}`}>
          {STATUS_MESSAGES[status]}
        </p>
      )}
    </form>
  );
}
