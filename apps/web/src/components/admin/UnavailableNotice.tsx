import { CloudOff } from "lucide-react";
import type { ReactNode } from "react";

/** Shown when the API cannot answer: the page degrades to this notice rather than an error page. */
export function UnavailableNotice({ children }: { readonly children: ReactNode }) {
  return (
    <div role="status" className="flex gap-4 rounded-[10px] bg-white p-6 shadow-[0_0_0_1px_var(--color-line)]">
      <CloudOff aria-hidden className="size-7 shrink-0 text-muted" strokeWidth={1.5} />
      <p className="text-[17px] leading-[26px] text-ink-deep">{children}</p>
    </div>
  );
}
