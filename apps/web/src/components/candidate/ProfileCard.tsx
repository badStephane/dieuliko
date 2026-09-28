import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { CANDIDATE_PROFILE_PATH } from "@/features/candidate/paths";
import { profileCompletion, type Profile } from "@/features/candidate/profile";

/** Profile completion at a glance, with the steps left and the way to the editor. */
export function ProfileCard({ profile }: { readonly profile: Profile }) {
  const { percent, steps } = profileCompletion(profile);
  const isComplete = percent === 100;
  return (
    <section aria-labelledby="profile-card-title" className="flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="profile-card-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
          Mon profil
        </h2>
        <p className="text-[17px] leading-[26px] font-semibold text-ink">{percent} %</p>
      </div>
      <div
        role="progressbar"
        aria-label="Profil complété"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2.5 overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <ul className="grid gap-2 tab:grid-cols-2">
        {steps.map((step) => (
          <li key={step.label} className={`flex items-center gap-2.5 text-[16px] leading-6 ${step.done ? "text-ink" : "text-muted"}`}>
            {step.done ? (
              <CheckCircle2 aria-hidden className="size-5 shrink-0 text-primary" strokeWidth={2} />
            ) : (
              <Circle aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
            )}
            <span>
              {step.label}
              <span className="sr-only">{step.done ? " : fait" : " : à compléter"}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        href={CANDIDATE_PROFILE_PATH}
        className="inline-flex min-h-12 items-center justify-center self-start rounded-[8px] bg-primary px-5 text-[17px] font-semibold text-white transition-colors duration-150 hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {profile.updatedAt === null ? "Compléter mon profil" : isComplete ? "Modifier mon profil" : "Continuer mon profil"}
      </Link>
    </section>
  );
}
