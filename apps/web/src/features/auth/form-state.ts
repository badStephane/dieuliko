import { ApiError } from "@/lib/api-client";

/** State returned by auth Server Actions to their form (`useActionState`). */
export interface FormState {
  readonly status: "idle" | "error" | "success";
  /** Message for the whole form (French). */
  readonly message?: string;
  /** Per-field messages, keyed by input name. */
  readonly fields?: Readonly<Record<string, string>>;
  /** Submitted values to refill the form after an error (never passwords). */
  readonly values?: Readonly<Record<string, string>>;
}

export const IDLE: FormState = { status: "idle" };

const UNAVAILABLE_MESSAGE = "Le service est momentanément indisponible. Réessayez dans quelques instants.";

/** Errors whose API message is written for end users and can be shown as is. */
const USER_FACING_CODES: ReadonlySet<string> = new Set([
  "validation_failed",
  "email_taken",
  "invalid_credentials",
  "invalid_token",
  "rate_limited",
  "email_delivery_failed",
  "unauthenticated",
  "forbidden",
  "no_cv",
  "ai_busy",
  "ai_unavailable",
  "ai_failed",
  "no_letter",
  "not_found",
  "email_unverified",
  "already_applied",
  "company_has_applications",
  "daily_limit",
  "account_suspended",
  "claim_open",
  "company_claimed",
  "no_pending_claim",
]);

/** Turns a failed call into form feedback; unexpected failures get a generic message. */
export function errorState(error: unknown, values?: Readonly<Record<string, string>>): FormState {
  const base = values ? { values } : {};
  if (error instanceof ApiError && USER_FACING_CODES.has(error.code)) {
    return { status: "error", message: error.message, fields: error.fields, ...base };
  }
  return { status: "error", message: UNAVAILABLE_MESSAGE, ...base };
}

/** Reads a text field from a submitted form ("" when missing or not text). */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
