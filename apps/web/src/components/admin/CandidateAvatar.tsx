import type { CandidateSummary } from "@/features/admin/admin-api";
import { candidateInitials } from "./text";

const SIZES = {
  md: "size-12 text-[16px]",
  lg: "size-16 text-[22px] tab:size-20 tab:text-[26px]",
} as const;

interface CandidateAvatarProps {
  readonly candidate: Pick<CandidateSummary, "firstName" | "lastName" | "email">;
  readonly size?: keyof typeof SIZES;
}

/** The candidate's initials in a disc; decorative, their name is always written next to it. */
export function CandidateAvatar({ candidate, size = "md" }: CandidateAvatarProps) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-primary-deep ${SIZES[size]}`}>
      {candidateInitials(candidate)}
    </span>
  );
}
