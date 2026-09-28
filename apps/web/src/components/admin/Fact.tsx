import type { ReactNode } from "react";

/** One term/value row of a status card; place inside a <dl>. */
export function Fact({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[15px] leading-[22px] text-muted">{term}</dt>
      <dd className="text-[17px] leading-[26px] break-words text-ink">{children}</dd>
    </div>
  );
}
