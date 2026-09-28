/**
 * Class names for the server-rendered back-office pieces. They mirror those of `candidate/ActionControls`, whose
 * exports reach server components as client references (not strings), so they cannot be shared from there.
 */
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const ACTION = `inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[8px] px-5 text-[17px] font-semibold transition-colors duration-150 active:scale-[0.98] ${FOCUS_RING}`;

export const PRIMARY_ACTION = `${ACTION} bg-primary text-white hover:bg-ink`;
export const SECONDARY_ACTION = `${ACTION} bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-surface`;

export const ADMIN_CARD = "flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8";

export const TEXT_LINK = `inline-flex min-h-11 items-center gap-2 text-[16px] font-semibold text-ink underline-offset-4 hover:underline ${FOCUS_RING}`;

export const CONTROL =
  "min-h-12 w-full rounded-[8px] bg-white px-4 py-3 text-[17px] leading-[26px] text-ink-deep shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-150 placeholder:text-muted focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)]";

export const SECTION_TITLE = "text-[22px] leading-[30px] font-semibold tab:text-[24px]";
