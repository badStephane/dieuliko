import type { ReactNode } from "react";

type HeadingAlign = "left" | "center";

interface SectionHeadingProps {
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly align?: HeadingAlign;
  readonly light?: boolean;
  readonly className?: string;
}

/** Eyebrow label + 56px Reddit Sans title, as used by most sections. */
export function SectionHeading({
  eyebrow,
  title,
  align = "left",
  light = false,
  className = "",
}: SectionHeadingProps) {
  const alignClasses = align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <div className={`flex flex-col ${alignClasses} ${className}`}>
      <p
        className={`flex items-center gap-2.5 text-[18px] leading-[27px] font-bold tracking-[0.04em] uppercase ${
          light ? "text-accent-soft" : "text-primary-deep"
        }`}
      >
        {eyebrow}
      </p>
      <h2
        className={`text-[36px] leading-[1.2] font-bold tab:text-[45px] desk:text-[56px] ${
          light ? "text-white" : "text-ink"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}
