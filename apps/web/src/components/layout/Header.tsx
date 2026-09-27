"use client";

import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { activeNavIndex, COMPANY_SPACE_CTA, MAIN_NAV } from "@/lib/navigation";
import { AccountLink } from "./AccountLink";

const LOGO_SRC = "/brand/logo-primary.svg";
const LOGO_WIDTH = 131;
const LOGO_HEIGHT = 36;
/** Scroll distance after which the pill tightens and lifts off the page. */
const SCROLL_THRESHOLD_PX = 12;
/** Delay between two items of the mobile menu as they fade in. */
const MENU_STAGGER_MS = 50;

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function useIsScrolled(): boolean {
  return useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > SCROLL_THRESHOLD_PX,
    () => false,
  );
}

/**
 * Places the highlight pill under the active link and slides it when the active link changes.
 * Written straight to the DOM: it follows layout (font loading, resizes), not React state.
 */
function useActiveIndicator(activeIndex: number) {
  const listRef = useRef<HTMLUListElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    const target = listRef.current?.children[activeIndex];
    if (!indicator) return;
    if (!(target instanceof HTMLElement)) {
      indicator.style.opacity = "0";
      return;
    }

    const place = () => {
      indicator.style.transform = `translateX(${target.offsetLeft}px)`;
      indicator.style.width = `${target.offsetWidth}px`;
      indicator.style.opacity = "1";
    };
    place();
    // Slide only once the first position is set, so the pill does not fly in from the left on load.
    const frame = requestAnimationFrame(() => {
      indicator.dataset.ready = "true";
    });

    const observer = new ResizeObserver(place);
    observer.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeIndex]);

  return { listRef, indicatorRef };
}

function Logo() {
  return (
    <Link href="/" aria-label="Dieuliko, accueil" className="shrink-0 rounded-full focus-visible:outline-offset-4">
      <Image src={LOGO_SRC} alt="Dieuliko" width={LOGO_WIDTH} height={LOGO_HEIGHT} priority />
    </Link>
  );
}

function CompanySpaceButton({ className = "" }: { readonly className?: string }) {
  return (
    <Link
      href={COMPANY_SPACE_CTA.href}
      className={`group inline-flex items-center justify-center gap-1.5 rounded-full bg-primary font-semibold text-white transition-colors duration-300 hover:bg-ink ${className}`}
    >
      {COMPANY_SPACE_CTA.label}
      <ArrowUpRight
        aria-hidden
        className="size-[18px] transition-transform duration-300 motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5"
        strokeWidth={2.25}
      />
    </Link>
  );
}

function DesktopNav({ pathname }: { readonly pathname: string }) {
  const activeIndex = activeNavIndex(pathname, MAIN_NAV);
  const { listRef, indicatorRef } = useActiveIndicator(activeIndex);

  return (
    <nav aria-label="Navigation principale" className="relative hidden lg:block">
      <span
        ref={indicatorRef}
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-accent-soft opacity-0 data-ready:transition-[transform,width,opacity] data-ready:duration-300 data-ready:ease-out motion-reduce:transition-none"
      />
      <ul ref={listRef} className="relative flex items-center">
        {MAIN_NAV.map((link, index) => {
          const isActive = index === activeIndex;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`block rounded-full px-3 py-2 text-[16px] desk:px-4 leading-6 transition-colors duration-200 ${
                  isActive ? "font-semibold text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MenuToggle({ isOpen, onToggle }: { readonly isOpen: boolean; readonly onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls="mobile-menu"
      aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
      className="relative flex size-11 items-center justify-center rounded-full bg-surface lg:hidden"
    >
      <span className={`absolute h-[2px] w-[18px] rounded bg-ink transition-transform duration-300 ${isOpen ? "rotate-45" : "-translate-y-[4px]"}`} />
      <span className={`absolute h-[2px] w-[18px] rounded bg-ink transition-transform duration-300 ${isOpen ? "-rotate-45" : "translate-y-[4px]"}`} />
    </button>
  );
}

function revealDelay(isOpen: boolean, position: number): string {
  return isOpen ? `${position * MENU_STAGGER_MS}ms` : "0ms";
}

function MobileMenu({ pathname, isOpen }: { readonly pathname: string; readonly isOpen: boolean }) {
  const activeIndex = activeNavIndex(pathname, MAIN_NAV);
  const reveal = `transition-[opacity,translate] duration-500 ease-out ${
    isOpen ? "translate-y-0 opacity-100" : "motion-safe:translate-y-3 opacity-0"
  }`;

  return (
    <div
      id="mobile-menu"
      inert={!isOpen}
      className={`fixed inset-0 overflow-y-auto bg-white/95 px-6 pt-[112px] pb-10 backdrop-blur-xl transition-[opacity,visibility] duration-300 lg:hidden ${
        isOpen ? "visible opacity-100" : "invisible opacity-0"
      }`}
    >
      <nav aria-label="Navigation mobile">
        <ul className="flex flex-col gap-1">
          {MAIN_NAV.map((link, index) => (
            <li key={link.href} className={reveal} style={{ transitionDelay: revealDelay(isOpen, index) }}>
              <Link
                href={link.href}
                aria-current={index === activeIndex ? "page" : undefined}
                className={`block py-2 font-heading text-[34px] leading-tight font-semibold ${
                  index === activeIndex ? "text-primary" : "text-ink"
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div
        className={`mt-10 flex flex-col gap-5 border-t border-line pt-8 ${reveal}`}
        style={{ transitionDelay: revealDelay(isOpen, MAIN_NAV.length) }}
      >
        <AccountLink pathname={pathname} className="text-[18px] leading-7" />
        <CompanySpaceButton className="h-14 text-[18px]" />
      </div>
    </div>
  );
}

/** Mobile menu state; it closes on navigation, being only open for the path it was opened on. */
function useMobileMenu(pathname: string) {
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const isOpen = openedAt === pathname;

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenedAt(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return { isOpen, toggle: () => setOpenedAt(isOpen ? null : pathname) };
}

/**
 * Site header: a translucent pill floating over the page, tightening once the page scrolls.
 * Out of the document flow so page heroes run underneath it; the first section of every page
 * reserves the space (see the page banners' top padding).
 */
export function Header() {
  const pathname = usePathname();
  const isScrolled = useIsScrolled();
  const menu = useMobileMenu(pathname);
  const isLifted = isScrolled || menu.isOpen;

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-[10px] pt-[10px] tab:px-5 lg:pt-4">
      <MobileMenu pathname={pathname} isOpen={menu.isOpen} />
      <div
        className={`relative mx-auto flex max-w-[1200px] items-center justify-between gap-4 rounded-full border bg-white/80 pr-2 pl-5 backdrop-blur-xl transition-[height,box-shadow,border-color] duration-300 lg:pr-2.5 lg:pl-6 desk:gap-6 ${
          isLifted
            ? "h-[60px] border-line/80 shadow-[0_8px_30px_-12px_rgba(17,24,39,0.25)] lg:h-[64px]"
            : "h-[64px] border-white/70 shadow-[0_2px_12px_-6px_rgba(17,24,39,0.12)] lg:h-[76px]"
        }`}
      >
        <Logo />
        <DesktopNav pathname={pathname} />
        <div className="hidden items-center gap-4 lg:flex desk:gap-5">
          <AccountLink pathname={pathname} className="text-[16px] leading-6" />
          <CompanySpaceButton className="h-11 px-5 text-[16px]" />
        </div>
        <MenuToggle isOpen={menu.isOpen} onToggle={menu.toggle} />
      </div>
    </header>
  );
}
