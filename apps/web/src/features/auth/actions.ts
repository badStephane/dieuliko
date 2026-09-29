"use server";

import { redirect } from "next/navigation";
import { errorState, formText, type FormState } from "./form-state";
import type { User } from "./auth-api";
import { ACCOUNT_TYPE_FIELD, afterLoginPath, LOGIN_PATH, NEXT_PARAM, RESET_DONE_PARAM } from "./redirects";
import { clearSessionCookie, getAuthApi, requestContext, setSessionCookie } from "./server";

const PASSWORD_RESET_SENT =
  "Si un compte existe avec cette adresse, vous allez recevoir un email avec un lien pour choisir un nouveau mot de passe.";
const EMAIL_VERIFIED = "Votre adresse email est confirmée. Merci !";
const VERIFICATION_SENT = "Un nouveau lien de confirmation vient de vous être envoyé.";

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = {
    firstName: formText(formData, "firstName"),
    lastName: formText(formData, "lastName"),
    email: formText(formData, "email"),
  };
  const accountType = formText(formData, ACCOUNT_TYPE_FIELD) === "company" ? { accountType: "company" as const } : {};
  let role: User["role"];
  try {
    const { user, session } = await getAuthApi().signUp(
      { ...values, password: formText(formData, "password"), ...accountType },
      await requestContext(),
    );
    await setSessionCookie(session.token, session.expiresAt);
    role = user.role;
  } catch (error: unknown) {
    return errorState(error, values);
  }
  redirect(afterLoginPath(role, formText(formData, NEXT_PARAM)));
}

export async function logInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { email: formText(formData, "email") };
  let role: User["role"];
  try {
    const { user, session } = await getAuthApi().logIn(values.email, formText(formData, "password"), await requestContext());
    await setSessionCookie(session.token, session.expiresAt);
    role = user.role;
  } catch (error: unknown) {
    return errorState(error, values);
  }
  redirect(afterLoginPath(role, formText(formData, NEXT_PARAM)));
}

/** Revokes the session on the API (best effort) and always clears the cookie. */
export async function logOutAction(): Promise<void> {
  try {
    const context = await requestContext();
    if (context.bearer) await getAuthApi().logOut(context);
  } catch {
    // The cookie is cleared anyway: an unreachable API must not keep the user logged in locally.
  }
  await clearSessionCookie();
  redirect("/");
}

export async function forgotPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { email: formText(formData, "email") };
  try {
    await getAuthApi().requestPasswordReset(values.email, await requestContext());
  } catch (error: unknown) {
    return errorState(error, values);
  }
  return { status: "success", message: PASSWORD_RESET_SENT };
}

export async function resetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  try {
    await getAuthApi().resetPassword(formText(formData, "token"), formText(formData, "password"), await requestContext());
  } catch (error: unknown) {
    return errorState(error);
  }
  // The reset revoked every session, including this browser's.
  await clearSessionCookie();
  redirect(`${LOGIN_PATH}?${RESET_DONE_PARAM}=1`);
}

export async function verifyEmailAction(_previous: FormState, formData: FormData): Promise<FormState> {
  try {
    await getAuthApi().verifyEmail(formText(formData, "token"), await requestContext());
  } catch (error: unknown) {
    return errorState(error);
  }
  return { status: "success", message: EMAIL_VERIFIED };
}

export async function resendVerificationAction(): Promise<FormState> {
  try {
    await getAuthApi().resendVerification(await requestContext());
  } catch (error: unknown) {
    return errorState(error);
  }
  return { status: "success", message: VERIFICATION_SENT };
}
