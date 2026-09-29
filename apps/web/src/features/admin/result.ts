import { errorState } from "@/features/auth/form-state";
import { redirectOnLostSession } from "@/features/auth/server";

export const INVALID_REQUEST = "La demande n’a pas pu être lue. Rechargez la page puis réessayez.";

/** A back-office action's outcome; `fields` holds per-field messages of a rejected form. */
export type AdminResult =
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly message: string; readonly fields?: Readonly<Record<string, string>> };

/** Turns a failed call into an action result; a lost session goes to the login page, then back to `returnTo`. */
export function failure(error: unknown, returnTo: string, withFields: boolean): AdminResult {
  redirectOnLostSession(error, returnTo);
  const state = errorState(error);
  const message = state.message ?? INVALID_REQUEST;
  if (withFields && state.fields && Object.keys(state.fields).length > 0) return { status: "error", message, fields: state.fields };
  return { status: "error", message: Object.values(state.fields ?? {})[0] ?? message };
}
