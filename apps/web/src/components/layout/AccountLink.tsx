"use client";

import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CANDIDATE_HOME_PATH, LOGIN_PATH } from "@/features/auth/redirects";

type AccountState =
  | { readonly status: "loading" }
  | { readonly status: "guest" }
  | { readonly status: "user"; readonly firstName: string };

function readFirstName(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("user" in body)) return null;
  const { user } = body;
  if (typeof user !== "object" || user === null || !("firstName" in user)) return null;
  return typeof user.firstName === "string" ? user.firstName : null;
}

/**
 * Login state of the visitor, fetched after hydration so pages stay static.
 * Refreshed on every navigation: logging in or out redirects to another page.
 */
function useAccount(pathname: string): AccountState {
  const [state, setState] = useState<AccountState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json())
      .then((body: unknown) => {
        const firstName = readFirstName(body);
        setState(firstName ? { status: "user", firstName } : { status: "guest" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Account state unavailable", error);
        setState({ status: "guest" });
      });
    return () => controller.abort();
  }, [pathname]);

  return state;
}

interface AccountLinkProps {
  readonly pathname: string;
  readonly className?: string;
}

/** "Connexion" for visitors, the candidate's first name once logged in. Hidden while loading. */
export function AccountLink({ pathname, className = "" }: AccountLinkProps) {
  const account = useAccount(pathname);
  const isUser = account.status === "user";
  const href = isUser ? CANDIDATE_HOME_PATH : LOGIN_PATH;
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      aria-hidden={account.status === "loading" ? true : undefined}
      tabIndex={account.status === "loading" ? -1 : undefined}
      className={`inline-flex items-center gap-2 transition-[color,opacity] duration-300 ${
        account.status === "loading" ? "pointer-events-none opacity-0" : "opacity-100"
      } ${isActive ? "font-semibold text-primary" : "text-ink hover:text-primary"} ${className}`}
    >
      <CircleUserRound aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
      <span className="max-w-[160px] truncate">{isUser ? `Mon espace (${account.firstName})` : "Connexion"}</span>
    </Link>
  );
}
