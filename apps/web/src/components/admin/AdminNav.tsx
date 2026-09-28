"use client";

import { Building2, LayoutDashboard, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_CANDIDATES_PATH, ADMIN_COMPANIES_PATH, ADMIN_HOME_PATH, ADMIN_NEW_COMPANY_PATH } from "@/features/admin/paths";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly isCurrent: (pathname: string) => boolean;
}

const within = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

const ITEMS: readonly NavItem[] = [
  { href: ADMIN_HOME_PATH, label: "Tableau de bord", icon: LayoutDashboard, isCurrent: (pathname) => pathname === ADMIN_HOME_PATH },
  {
    href: ADMIN_COMPANIES_PATH,
    label: "Entreprises",
    icon: Building2,
    isCurrent: (pathname) => within(pathname, ADMIN_COMPANIES_PATH) || pathname === ADMIN_NEW_COMPANY_PATH,
  },
  { href: ADMIN_CANDIDATES_PATH, label: "Candidats", icon: Users, isCurrent: (pathname) => within(pathname, ADMIN_CANDIDATES_PATH) },
];

/** Sections of the back-office, the current one highlighted. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Back-office" className="flex flex-col gap-3">
      <p className="text-[14px] leading-5 font-semibold tracking-wide text-muted uppercase">Back-office</p>
      <ul className="flex flex-wrap gap-2">
        {ITEMS.map(({ href, label, icon: Icon, isCurrent }) => {
          const current = isCurrent(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[16px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  current ? "bg-ink text-white" : "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"
                }`}
              >
                <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
