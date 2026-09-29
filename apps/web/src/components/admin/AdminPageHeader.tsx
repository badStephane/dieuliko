import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TEXT_LINK } from "./styles";

interface AdminPageHeaderProps {
  readonly title: string;
  readonly subtitle?: ReactNode;
  /** Shown before the title, such as a candidate's initials. */
  readonly leading?: ReactNode;
  /** Buttons shown next to the title on wide screens, under it on phones. */
  readonly actions?: ReactNode;
  readonly back?: { readonly href: string; readonly label: string };
}

/** Title block of a back-office page: compact, unlike the public pages' banner. */
export function AdminPageHeader({ title, subtitle, leading, actions, back }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      {back && (
        <Link href={back.href} className={`${TEXT_LINK} self-start`}>
          <ArrowLeft aria-hidden className="size-5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 tab:flex-row tab:items-end tab:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {leading}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[32px] leading-[1.2] font-bold break-words tab:text-[40px]">{title}</h1>
            {subtitle && <div className="text-[17px] leading-[26px] text-ink-deep">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-col gap-3 tab:flex-row">{actions}</div>}
      </div>
    </div>
  );
}
