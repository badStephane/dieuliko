import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { FOCUS_RING } from "./styles";

interface StatTileProps {
  readonly label: string;
  readonly value: number;
  /** Context under the number ("62 % des inscrits"). */
  readonly hint?: string;
  /** Opens the matching filtered list. */
  readonly href?: string;
}

const TILE = "flex h-full flex-col gap-1 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)]";

/** One key figure of the dashboard. */
export function StatTile({ label, value, hint, href }: StatTileProps) {
  const body = (
    <>
      <span className="text-[16px] leading-6 text-ink-deep">{label}</span>
      <span className="text-[32px] leading-[1.2] font-bold text-ink tab:text-[36px]">{formatNumber(value)}</span>
      {hint && <span className="text-[15px] leading-[22px] text-muted">{hint}</span>}
    </>
  );
  if (!href) return <div className={TILE}>{body}</div>;
  return (
    <Link href={href} className={`${TILE} transition-shadow duration-150 hover:shadow-[0_0_0_2px_var(--color-primary)] ${FOCUS_RING}`}>
      {body}
    </Link>
  );
}
