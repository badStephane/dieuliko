import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { FOCUS_RING } from "../styles";
import { signedChange } from "./chart-scale";

interface KpiTileProps {
  readonly label: string;
  readonly value: number;
  /** This week against the one before; up is good for every figure of the dashboard. */
  readonly trend?: { readonly last7Days: number; readonly previous7Days: number };
  /** Context when there is no trend ("3 vérifiées"). */
  readonly hint?: string;
  /** Opens the matching list, when there is one. */
  readonly href?: string;
}

const TILE = "flex h-full flex-col gap-2 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)]";
const LINK_TILE = `${TILE} transition-shadow duration-150 hover:shadow-[0_0_0_2px_var(--color-primary)] ${FOCUS_RING}`;

function TrendLine({ last7Days, previous7Days }: NonNullable<KpiTileProps["trend"]>) {
  const change = last7Days - previous7Days;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : ArrowRight;
  const tone = change > 0 ? "text-emerald-700" : change < 0 ? "text-red-700" : "text-muted";
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-[14px] leading-5">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${tone}`}>
        <Icon aria-hidden className="size-4" />
        {signedChange(last7Days, previous7Days)}
      </span>
      <span className="text-muted">
        {formatNumber(last7Days)} cette semaine, contre {formatNumber(previous7Days)} la précédente
      </span>
    </span>
  );
}

/** A key figure of the dashboard, with its weekly trend. */
export function KpiTile({ label, value, trend, hint, href }: KpiTileProps) {
  const body = (
    <>
      <span className="text-[15px] leading-6 font-medium text-ink-deep">{label}</span>
      <span className="text-[34px] leading-[1.1] font-bold text-ink tab:text-[38px]">{formatNumber(value)}</span>
      {trend ? <TrendLine {...trend} /> : hint && <span className="text-[14px] leading-5 text-muted">{hint}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={LINK_TILE}>
      {body}
    </Link>
  ) : (
    <div className={TILE}>{body}</div>
  );
}
