import type { CSSProperties } from "react";

interface TintedShapeProps {
  /** Monochrome template shape (SVG or PNG) used as an alpha mask. */
  readonly src: string;
  /** Tailwind background utility giving the shape its brand colour. */
  readonly tone: string;
  readonly className?: string;
}

/** Recolours a single-colour template doodle with a brand token (the file's own colour is ignored). */
export function TintedShape({ src, tone, className = "" }: TintedShapeProps) {
  const style: CSSProperties = {
    maskImage: `url(${src})`,
    maskSize: "contain",
    maskRepeat: "no-repeat",
    maskPosition: "center",
  };
  return <span aria-hidden style={style} className={`block ${tone} ${className}`} />;
}

const RING_RADII = [40.5, 28.5, 16.5] as const;

/** Soft orange "radar" disc behind the hero photo (was a teal PNG); spins via the parent class. */
export function RadarDisc({ className = "" }: { readonly className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className={className}>
      <circle cx="50" cy="50" r="50" className="fill-accent-soft" />
      <g className="stroke-white/70" strokeWidth="1.2" fill="none">
        {RING_RADII.map((radius) => (
          <circle key={radius} cx="50" cy="50" r={radius} />
        ))}
        <path d="M50 0v33.5M50 66.5V100M66.5 50H100" />
      </g>
    </svg>
  );
}
