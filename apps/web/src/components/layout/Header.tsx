"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { COMPANY_SPACE_CTA, KNOWN_SECTIONS, MAIN_NAV, type NavLink } from "@/lib/navigation";
import { AccountLink } from "./AccountLink";

/**
 * - "bar":  home page and 404 — full-width white bar.
 * - "card": inner pages — white rounded card floating 16px below the top, over the page banner.
 */
type HeaderVariant = "bar" | "card";

const LOGO_SRC = "/brand/logo-primary.svg";
const LOGO_WIDTH = 174;
const LOGO_HEIGHT = 48;

function getVariant(pathname: string): HeaderVariant {
  const section = pathname.split("/")[1] ?? "";
  return KNOWN_SECTIONS.has(section) ? "card" : "bar";
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Logo() {
  return (
    <Link href="/" aria-label="Dieuliko, accueil" className="shrink-0">
      <Image src={LOGO_SRC} alt="Dieuliko" width={LOGO_WIDTH} height={LOGO_HEIGHT} priority />
    </Link>
  );
}

const DESKTOP_INNER: Record<HeaderVariant, string> = {
  bar: "rounded-b-[8px] border-b border-line",
  card: "rounded-[8px]",
};

function DesktopHeader({ pathname, variant }: { readonly pathname: string; readonly variant: HeaderVariant }) {
  return (
    <div className={`hidden desk:block ${variant === "bar" ? "bg-white" : "pt-4"}`}>
      <div
        className={`mx-auto flex h-[97px] max-w-[1200px] items-center justify-between bg-white px-5 ${DESKTOP_INNER[variant]}`}
      >
        <Logo />
        <nav aria-label="Navigation principale" className="flex items-center gap-10">
          {MAIN_NAV.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`text-[18px] leading-[27px] transition-colors ${
                  active ? "font-semibold text-primary" : "text-ink hover:text-primary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-8">
          <AccountLink pathname={pathname} className="text-[18px] leading-[27px]" />
          <Link
            href={COMPANY_SPACE_CTA.href}
            className="inline-flex h-[57px] items-center rounded-[4px] bg-primary px-[30px] text-[18px] leading-[27px] font-semibold text-white transition-colors duration-300 hover:bg-ink"
          >
            {COMPANY_SPACE_CTA.label}
          </Link>
        </div>
      </div>
    </div>
  );
}

const MOBILE_LINKS: readonly NavLink[] = [...MAIN_NAV, COMPANY_SPACE_CTA];

function MobileHeader({ pathname }: { readonly pathname: string }) {
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  // The menu closes on navigation: it is only open for the path it was opened on.
  const isOpen = openedAt === pathname;

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
  }, [isOpen]);

  return (
    <div className="fixed inset-x-[10px] top-[10px] z-50 max-h-dvh overflow-y-auto rounded-[10px] bg-white px-5 desk:hidden">
      <div className="flex h-[88px] items-center justify-between">
        <Logo />
        <button
          type="button"
          onClick={() => setOpenedAt(isOpen ? null : pathname)}
          aria-expanded={isOpen}
          aria-controls="mobile-menu"
          aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
          className="relative flex size-11 items-center justify-center"
        >
          <span className={`absolute h-[2px] w-5 rounded bg-ink transition-transform duration-300 ${isOpen ? "rotate-45" : "-translate-y-[4px]"}`} />
          <span className={`absolute h-[2px] w-5 rounded bg-ink transition-transform duration-300 ${isOpen ? "-rotate-45" : "translate-y-[4px]"}`} />
        </button>
      </div>
      <nav
        id="mobile-menu"
        aria-label="Navigation mobile"
        className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <ul className="overflow-hidden">
          {MOBILE_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`block py-2.5 text-[16px] leading-6 ${isActive(pathname, link.href) ? "text-primary" : "text-ink"}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <AccountLink pathname={pathname} className="py-2.5 text-[16px] leading-6" />
          </li>
          <li aria-hidden className="h-5" />
        </ul>
      </nav>
    </div>
  );
}

/**
 * Site header, out of the document flow at every breakpoint so page heroes run underneath it.
 * The first section of every page reserves the space (see the page banners' top padding).
 */
export function Header() {
  const pathname = usePathname();

  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <DesktopHeader pathname={pathname} variant={getVariant(pathname)} />
      <MobileHeader pathname={pathname} />
    </header>
  );
}
