import Link from "next/link";
import type { AuditEntry } from "@/features/admin/admin-api";
import { adminCandidatePath, adminClaimPath, adminCompanyPath } from "@/features/admin/paths";
import { formatDate } from "@/lib/format";
import { auditActor, auditFields, auditTarget, auditTone, auditVerb, type AuditTone } from "./audit-text";

const TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" });

const DOTS: Readonly<Record<AuditTone, string>> = {
  neutral: "bg-muted/60",
  success: "bg-emerald-600",
  warning: "bg-primary",
  danger: "bg-red-600",
};

const TARGET_PATHS: Readonly<Record<AuditEntry["targetType"], (id: string) => string>> = {
  company: adminCompanyPath,
  user: adminCandidatePath,
  claim: adminClaimPath,
};

/** Entries of one day, keeping the API's order (newest first). */
function byDay(entries: readonly AuditEntry[]): readonly { readonly day: string; readonly entries: readonly AuditEntry[] }[] {
  return entries.reduce<{ day: string; entries: AuditEntry[] }[]>((days, entry) => {
    const day = formatDate(entry.createdAt);
    const last = days.at(-1);
    return last?.day === day ? [...days.slice(0, -1), { day, entries: [...last.entries, entry] }] : [...days, { day, entries: [entry] }];
  }, []);
}

function Target({ entry }: { readonly entry: AuditEntry }) {
  const label = auditTarget(entry);
  if (!entry.targetLabel.trim()) return <span className="font-semibold">{label}</span>;
  const href = TARGET_PATHS[entry.targetType](entry.targetId);
  return (
    <Link href={href} className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-primary">
      {label}
    </Link>
  );
}

/** The activity log, one timeline per day. */
export function AuditList({ entries }: { readonly entries: readonly AuditEntry[] }) {
  return (
    <div className="flex flex-col gap-8">
      {byDay(entries).map(({ day, entries: dayEntries }) => (
        <section key={day} aria-label={day} className="flex flex-col gap-3">
          <h2 className="text-[14px] leading-5 font-semibold tracking-wide text-muted uppercase">{day}</h2>
          <ol className="flex flex-col">
            {dayEntries.map((entry, index) => {
              const fields = auditFields(entry.changedFields);
              return (
                <li key={entry.id} className="relative flex gap-4 pb-5 pl-1 last:pb-0">
                  {index < dayEntries.length - 1 && <span aria-hidden className="absolute top-5 bottom-0 left-[9px] w-px bg-line" />}
                  <span aria-hidden className={`relative mt-2 size-3 shrink-0 rounded-full ring-4 ring-white ${DOTS[auditTone(entry.action)]}`} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 tab:flex-row tab:items-baseline tab:gap-4">
                    <p className="min-w-0 flex-1 text-[16px] leading-6 break-words text-ink-deep">
                      <span className="font-semibold text-ink">{auditActor(entry)}</span> {auditVerb(entry.action)} <Target entry={entry} />
                      {fields && <span className="text-muted"> ({fields})</span>}
                    </p>
                    <time dateTime={entry.createdAt} className="shrink-0 text-[14px] leading-5 text-muted tabular-nums">
                      {TIME.format(new Date(entry.createdAt))}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
