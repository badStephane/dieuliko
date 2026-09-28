import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "warning" | "success" | "danger";

const TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: "bg-surface text-ink",
  warning: "bg-accent-soft text-ink",
  success: "bg-emerald-50 text-emerald-800",
  danger: "bg-red-50 text-red-700",
};

/** Short status label ("Masquée", "Suspendu") next to a list item or a title. */
export function StatusBadge({ tone = "neutral", children }: { readonly tone?: BadgeTone; readonly children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-[14px] leading-5 font-semibold ${TONES[tone]}`}>{children}</span>;
}
