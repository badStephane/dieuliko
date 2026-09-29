"use client";

import { Building2, ExternalLink, LayoutDashboard, Menu, Users, X, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { LogOutButton } from "@/components/auth/AuthForms";
import { ADMIN_CANDIDATES_PATH, ADMIN_COMPANIES_PATH, ADMIN_HOME_PATH, ADMIN_NEW_COMPANY_PATH } from "@/features/admin/paths";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly isCurrent: (pathname: string) => boolean;
}

interface AdminShellProps {
  readonly user: { readonly firstName: string; readonly lastName: string; readonly email: string };
  readonly children: ReactNode;
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

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

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "A";
}

/** Sections, link to the public site and the signed-in admin; the same on the sidebar and in the phone menu. */
function SidebarContent({ user, pathname }: { readonly user: AdminShellProps["user"]; readonly pathname: string }) {
  return (
    <div className="flex h-full flex-col gap-8 px-4 py-6">
      <Link href={ADMIN_HOME_PATH} className={`flex items-center gap-3 rounded-[8px] px-2 ${FOCUS}`}>
        <Image src="/brand/logo-on-dark.svg" alt="Dieuliko" width={116} height={32} priority />
        <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[12px] leading-5 font-semibold tracking-wide text-primary uppercase">Admin</span>
      </Link>

      <nav aria-label="Back-office" className="flex-1">
        <ul className="flex flex-col gap-1">
          {ITEMS.map(({ href, label, icon: Icon, isCurrent }) => {
            const current = isCurrent(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={`relative flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-[16px] font-semibold transition-colors duration-150 ${FOCUS} ${
                    current ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {current && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary" />}
                  <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-4 border-t border-white/10 pt-5">
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-[15px] font-semibold text-white/70 hover:bg-white/5 hover:text-white ${FOCUS}`}
        >
          <ExternalLink aria-hidden className="size-5" strokeWidth={1.75} />
          Voir le site
          <span className="sr-only">(nouvel onglet)</span>
        </Link>
        <div className="flex items-center gap-3 px-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-bold text-white">
            {initials(user.firstName, user.lastName)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] leading-5 font-semibold text-white">
              {user.firstName} {user.lastName}
            </span>
            <span className="truncate text-[13px] leading-5 text-white/60">{user.email}</span>
          </span>
        </div>
        <LogOutButton className={`min-h-11 rounded-[8px] px-3 text-left text-[15px] font-semibold text-white/70 hover:bg-white/5 hover:text-white ${FOCUS}`} />
      </div>
    </div>
  );
}

/**
 * Back-office frame, in place of the site's header and footer: a fixed dark sidebar on desktops, a top bar opening
 * the same content in a modal menu below. The native dialog traps the focus and closes on Escape.
 */
export function AdminShell({ user, children }: AdminShellProps) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => menuRef.current?.close(), [pathname]);

  return (
    <div data-admin-shell className="min-h-screen bg-surface desk:pl-[264px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] overflow-y-auto bg-ink desk:block">
        <SidebarContent user={user} pathname={pathname} />
      </aside>

      <div className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/90 px-4 backdrop-blur-xl tab:px-8 desk:hidden">
        <Link href={ADMIN_HOME_PATH} className={`flex items-center gap-2 rounded-[8px] ${FOCUS}`}>
          <Image src="/brand/logo-primary.svg" alt="Dieuliko" width={109} height={30} priority />
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] leading-5 font-semibold tracking-wide text-primary-deep uppercase">Admin</span>
        </Link>
        <button
          type="button"
          onClick={() => menuRef.current?.showModal()}
          className={`flex size-11 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-surface ${FOCUS}`}
        >
          <Menu aria-hidden className="size-6" />
          <span className="sr-only">Ouvrir le menu</span>
        </button>
      </div>

      <dialog
        ref={menuRef}
        aria-label="Menu du back-office"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close(); // click on the backdrop
        }}
        className="m-0 h-dvh max-h-none w-[min(320px,85vw)] bg-ink p-0 backdrop:bg-ink/50 backdrop:backdrop-blur-sm"
      >
        <button
          type="button"
          onClick={() => menuRef.current?.close()}
          className={`absolute top-5 right-3 flex size-11 cursor-pointer items-center justify-center rounded-full text-white/80 hover:bg-white/10 ${FOCUS}`}
        >
          <X aria-hidden className="size-6" />
          <span className="sr-only">Fermer le menu</span>
        </button>
        <SidebarContent user={user} pathname={pathname} />
      </dialog>

      {/* The site's layout already wraps every page in <main>. */}
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-4 py-8 tab:px-8 desk:px-10 desk:py-10">{children}</div>
    </div>
  );
}
