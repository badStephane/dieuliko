"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, formText, type FormState } from "@/features/auth/form-state";
import { redirectOnLostSession, requestContext } from "@/features/auth/server";
import { getCompanySpaceApi } from "./server";
import { CLAIM_REQUEST_PATH, COMPANY_SPACE_PATH } from "./paths";

/** Asks to manage a listing, then shows the request in the company space. */
export async function requestClaimAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = {
    companySlug: formText(formData, "companySlug"),
    jobTitle: formText(formData, "jobTitle"),
    phone: formText(formData, "phone"),
    message: formText(formData, "message"),
  };
  try {
    await getCompanySpaceApi().requestClaim(values, await requestContext());
  } catch (error: unknown) {
    redirectOnLostSession(error, CLAIM_REQUEST_PATH);
    return errorState(error, values);
  }
  revalidatePath(COMPANY_SPACE_PATH);
  redirect(COMPANY_SPACE_PATH);
}

/** Withdraws the pending request. */
export async function cancelClaimAction(): Promise<FormState> {
  try {
    await getCompanySpaceApi().cancelClaim(await requestContext());
  } catch (error: unknown) {
    redirectOnLostSession(error, COMPANY_SPACE_PATH);
    return errorState(error);
  }
  revalidatePath(COMPANY_SPACE_PATH);
  return { status: "success", message: "Votre demande est annulée." };
}
