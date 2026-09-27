import type { ReactNode } from "react";

interface ContainerProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/** 1200px content column; 20px gutter on mobile, 30px on tablet (Framer layout). */
export function Container({ children, className = "" }: ContainerProps) {
  return (
    <div className={`mx-auto w-full max-w-[1260px] px-5 tab:px-[30px] ${className}`}>{children}</div>
  );
}
