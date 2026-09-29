"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { formatNumber } from "@/lib/format";
import { longDay, niceMax, peakIndex, shortDay } from "./chart-scale";

export interface DailyPoint {
  readonly day: string;
  readonly value: number;
}

interface DailyBarChartProps {
  readonly title: string;
  /** Unit of one bar's value, singular and plural ("inscription", "inscriptions"). */
  readonly unit: readonly [string, string];
  readonly points: readonly DailyPoint[];
}

const PLOT_HEIGHT = 160;

function unitLabel(value: number, [singular, plural]: readonly [string, string]): string {
  return `${formatNumber(value)} ${value > 1 ? plural : singular}`;
}

/**
 * One count per day as columns: one series, so no legend (the title names it). The peak carries a direct label, the
 * hovered or focused day a tooltip; the table under the chart holds every value. The plot is one tab stop: arrow keys
 * move from day to day.
 */
export function DailyBarChart({ title, unit, points }: DailyBarChartProps) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);
  const values = points.map((point) => point.value);
  const top = niceMax(values);
  const peak = peakIndex(values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const shown = active === null ? null : points[active];

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const last = points.length - 1;
    const next: Readonly<Record<string, number>> = {
      ArrowLeft: Math.max(0, (active ?? last + 1) - 1),
      ArrowRight: Math.min(last, (active ?? -1) + 1),
      Home: 0,
      End: last,
    };
    const target = next[event.key];
    if (target === undefined) return;
    event.preventDefault();
    setActive(target);
  }

  return (
    <figure aria-labelledby={titleId} className="flex flex-col gap-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span id={titleId} className="text-[18px] leading-7 font-semibold text-ink">
          {title}
        </span>
        <span className="text-[15px] leading-6 text-muted">{unitLabel(total, unit)} sur 30 jours</span>
      </figcaption>

      {/* The top margin keeps room for the peak's label above the tallest bar. */}
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-3">
        {/* Y axis: three clean ticks, the values not labelled on the bars. */}
        <div aria-hidden className="relative w-6 text-right text-[12px] leading-none text-muted tabular-nums" style={{ height: PLOT_HEIGHT }}>
          {[top, top / 2, 0].map((tick, index) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${index * 50}%` }}>
              {Number.isInteger(tick) ? formatNumber(tick) : ""}
            </span>
          ))}
        </div>

        <div
          role="img"
          aria-label={`${title} : ${unitLabel(total, unit)} sur les 30 derniers jours. Utilisez les flèches pour lire chaque jour ; le tableau ci-dessous donne toutes les valeurs.`}
          tabIndex={0}
          onKeyDown={move}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="relative rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          style={{ height: PLOT_HEIGHT }}
        >
          {[0, 50, 100].map((position) => (
            <span key={position} aria-hidden className="absolute inset-x-0 h-px bg-line" style={{ top: `${position}%` }} />
          ))}

          <div aria-hidden className="absolute inset-0 flex items-end gap-[2px]">
            {points.map((point, index) => {
              const height = (point.value / top) * 100;
              const isActive = index === active;
              return (
                <div
                  key={point.day}
                  onPointerEnter={() => setActive(index)}
                  className="relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center"
                >
                  {index === peak && active === null && (
                    <span className="absolute -translate-y-full pb-1 text-[12px] leading-none font-semibold text-ink tabular-nums" style={{ bottom: `${height}%` }}>
                      {formatNumber(point.value)}
                    </span>
                  )}
                  <span
                    className={`block w-full max-w-[24px] rounded-t-[4px] transition-colors duration-150 ${isActive ? "bg-ink" : "bg-primary"}`}
                    style={{ height: point.value > 0 ? `max(${height}%, 3px)` : 0 }}
                  />
                </div>
              );
            })}
          </div>

          {shown && active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 flex -translate-x-1/2 -translate-y-full flex-col rounded-[8px] bg-ink px-3 py-2 text-white shadow-[0_8px_24px_-8px_rgba(17,24,39,0.5)]"
              style={{ left: `clamp(64px, ${((active + 0.5) / points.length) * 100}%, calc(100% - 64px))` }}
            >
              <span className="text-[15px] leading-5 font-semibold whitespace-nowrap tabular-nums">{unitLabel(shown.value, unit)}</span>
              <span className="text-[13px] leading-5 whitespace-nowrap text-white/70">{longDay(shown.day)}</span>
            </div>
          )}
        </div>

        <div aria-hidden className="col-start-2 mt-2 flex justify-between text-[12px] leading-4 text-muted">
          <span>{points[0] ? shortDay(points[0].day) : ""}</span>
          <span>{points.at(-1) ? shortDay(points.at(-1)?.day ?? "") : ""}</span>
        </div>
      </div>

      <details className="group text-[15px] leading-6">
        <summary className="cursor-pointer self-start font-semibold text-ink underline-offset-4 hover:underline">Voir les données</summary>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-[8px] shadow-[inset_0_0_0_1px_var(--color-line)]">
          <table className="w-full text-left">
            <caption className="sr-only">{title}, par jour</caption>
            <thead>
              <tr className="text-[13px] text-muted">
                <th scope="col" className="px-3 py-2 font-semibold">
                  Jour
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Nombre
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point) => (
                <tr key={point.day} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-deep">{longDay(point.day)}</td>
                  <td className="px-3 py-1.5 text-right text-ink tabular-nums">{formatNumber(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
