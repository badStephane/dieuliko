import { COMPANY_PARAM } from "@/features/signup/company-param";
import { COMPANY_SPACE_PATH } from "@/lib/navigation";

export { COMPANY_SPACE_PATH };
export const COMPANY_SIGNUP_PATH = `${COMPANY_SPACE_PATH}/inscription`;
export const CLAIM_REQUEST_PATH = `${COMPANY_SPACE_PATH}/revendiquer`;
/** Query parameter naming the listing to claim ("?entreprise=sonatel"), as on the candidate sign-up. */
export const CLAIM_COMPANY_PARAM = COMPANY_PARAM;

/** The company sign-up, going on to ask for one listing. */
export function companySignupHref(slug: string): string {
  return `${COMPANY_SIGNUP_PATH}?${new URLSearchParams({ [CLAIM_COMPANY_PARAM]: slug }).toString()}`;
}

/** The claim form, set on one listing. */
export function claimRequestHref(slug: string): string {
  return `${CLAIM_REQUEST_PATH}?${new URLSearchParams({ [CLAIM_COMPANY_PARAM]: slug }).toString()}`;
}
