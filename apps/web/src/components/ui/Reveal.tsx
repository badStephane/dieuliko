"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface RevealProps {
  readonly children: ReactNode;
  /** Delay in ms, to stagger siblings (0, 100, 200…). */
  readonly delay?: number;
  readonly className?: string;
}

const REVEAL_THRESHOLD = 0.15;

/**
 * Fade-and-rise on first scroll into view, mirroring Framer's "appear" effect.
 * Respects prefers-reduced-motion (content is shown immediately).
 */
export function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: REVEAL_THRESHOLD },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,translate] duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
