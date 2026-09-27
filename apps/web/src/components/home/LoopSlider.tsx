"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { isOutsideWindow, toMiddleCopy } from "@/lib/loop-index";

/** Copies of the list rendered side by side so the loop never runs out of slides. */
const LOOP_COPIES = 5;
const MIDDLE_COPY = Math.floor(LOOP_COPIES / 2);
const SWIPE_THRESHOLD_PX = 50;
/** Most slides visible at once (desktop); slides outside this window are made inert. */
const MAX_VISIBLE = 3;
const SLIDE_TRANSITION = "translate 700ms cubic-bezier(0.22, 1, 0.36, 1)";

const ARROW_BUTTON_CLASSES =
  "relative z-10 flex size-[38px] shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink transition-colors duration-300 hover:border-primary hover:bg-primary hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary tab:size-[50px] desk:absolute desk:top-1/2 desk:size-14 desk:-translate-y-1/2";

export interface LoopSlide {
  readonly key: string;
  readonly content: ReactNode;
}

interface LoopSliderProps {
  readonly slides: readonly LoopSlide[];
  /** Accessible name of the carousel region. */
  readonly label: string;
  readonly previousLabel: string;
  readonly nextLabel: string;
}

/**
 * Infinite slideshow, one slide per click, no autoplay (3 visible on desktop, 2 on tablet,
 * 1 on mobile). Supports swipe. Slide contents are rendered by the (server) parent.
 */
export function LoopSlider({ slides, label, previousLabel, nextLabel }: LoopSliderProps) {
  const count = slides.length;
  const [index, setIndex] = useState(MIDDLE_COPY * count);
  const [isAnimated, setIsAnimated] = useState(false);
  const pointerStartX = useRef<number | null>(null);
  const hasSwiped = useRef(false);

  const loopedSlides = useMemo(
    () =>
      Array.from({ length: LOOP_COPIES }, (_, copy) =>
        slides.map((slide) => ({ content: slide.content, key: `${copy}-${slide.key}` })),
      ).flat(),
    [slides],
  );

  function go(delta: number) {
    setIsAnimated(true);
    setIndex((current) => current + delta);
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLUListElement>) {
    if (event.target !== event.currentTarget) return;
    const normalized = toMiddleCopy(index, count, MIDDLE_COPY);
    if (normalized === index) return;
    setIsAnimated(false);
    setIndex(normalized);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStartX.current = event.clientX;
    hasSwiped.current = false;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (pointerStartX.current === null) return;
    const deltaX = event.clientX - pointerStartX.current;
    pointerStartX.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    hasSwiped.current = true;
    go(deltaX < 0 ? 1 : -1);
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!hasSwiped.current) return;
    event.preventDefault();
    event.stopPropagation();
    hasSwiped.current = false;
  }

  const trackStyle: CSSProperties = {
    translate: `calc(${-index} * (var(--slide-w) + var(--gap)))`,
    transition: isAnimated ? SLIDE_TRANSITION : "none",
  };

  return (
    <div
      role="region"
      aria-roledescription="carrousel"
      aria-label={label}
      className="relative [--gap:12px] [--per:1] [--slide-w:calc((100%_-_(var(--per)_-_1)_*_var(--gap))_/_var(--per))] tab:[--gap:10px] tab:[--per:2] desk:[--gap:30px] desk:[--per:3]"
    >
      <div
        className="touch-pan-y overflow-hidden py-2"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => (pointerStartX.current = null)}
        onClickCapture={handleClickCapture}
      >
        <ul className="flex gap-(--gap)" style={trackStyle} onTransitionEnd={handleTransitionEnd}>
          {loopedSlides.map((slide, slideIndex) => {
            const isOutside = isOutsideWindow(slideIndex, index, MAX_VISIBLE);
            return (
              <li key={slide.key} className="flex shrink-0 basis-(--slide-w)" aria-hidden={isOutside} inert={isOutside}>
                {slide.content}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-[14px] flex justify-center gap-2.5 tab:mt-[13px] tab:gap-[15px] desk:mt-0">
        <button
          type="button"
          aria-label={previousLabel}
          onClick={() => go(-1)}
          className={`${ARROW_BUTTON_CLASSES} desk:-left-[25px]`}
        >
          <ArrowLeft aria-hidden className="size-4 tab:size-5" strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label={nextLabel}
          onClick={() => go(1)}
          className={`${ARROW_BUTTON_CLASSES} desk:-right-[25px]`}
        >
          <ArrowRight aria-hidden className="size-4 tab:size-5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
