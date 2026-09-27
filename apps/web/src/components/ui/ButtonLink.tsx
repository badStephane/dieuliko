import Link from "next/link";
import type { ReactNode } from "react";

type ButtonVariant = "primary" | "light";

interface ButtonLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly className?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-ink",
  light: "bg-white text-ink hover:bg-accent-soft",
};

export const BUTTON_BASE_CLASSES =
  "inline-flex h-[57px] items-center justify-center gap-2.5 rounded-[4px] px-[30px] text-[18px] leading-[27px] font-semibold transition-colors duration-300";

/** Solid CTA button used across the site ("Job Post", "All Categories", "Know About Us"…). */
export function ButtonLink({ href, children, variant = "primary", className = "" }: ButtonLinkProps) {
  return (
    <Link href={href} className={`${BUTTON_BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Link>
  );
}
