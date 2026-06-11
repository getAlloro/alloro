import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useActionDone } from "../../hooks/useActionDone";
import { TONE_COLOR } from "./focus/statusRules";

/**
 * ActionBanner — the shared "1 action" callout used by all three hubs
 * (Practice Hub, Referrals Hub, Local Rankings). One visual language:
 * accent-soft tint, terracotta eyebrow, ink title, "Mark done" that
 * collapses the banner (localStorage via useActionDone) until the next
 * analysis produces a different action.
 *
 * Spec: plans/06112026-design-consistency-pass (T2–T4)
 */

export type ActionBannerProps = {
  /** localStorage namespace, e.g. "practice-hub" | "referrals-hub" | "rankings-hub". */
  hub: string;
  eyebrow: string;
  title: string;
  description?: string | null;
  wizardTarget?: string;
};

/** Bare tinted shell — exported for sibling loading/empty states. */
export function ActionBannerShell({
  children,
  wizardTarget,
}: {
  children: ReactNode;
  wizardTarget?: string;
}) {
  return (
    <section
      data-wizard-target={wizardTarget}
      className="rounded-[14px] border border-accent-soft-line bg-accent-soft px-[22px] py-5"
    >
      {children}
    </section>
  );
}

export function ActionBannerEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-orange">
      {children}
    </div>
  );
}

export function ActionBanner({
  hub,
  eyebrow,
  title,
  description,
  wizardTarget,
}: ActionBannerProps) {
  const { isDone, markDone } = useActionDone(hub, title);

  if (isDone) {
    return (
      <ActionBannerShell wizardTarget={wizardTarget}>
        <div className="flex items-center gap-2.5">
          <Check size={16} aria-hidden style={{ color: TONE_COLOR.positive }} />
          <p className="text-[13.5px] font-semibold text-alloro-navy">
            Marked done.{" "}
            <span className="font-medium text-ink-muted">
              Your next action arrives with the next analysis.
            </span>
          </p>
        </div>
      </ActionBannerShell>
    );
  }

  return (
    <ActionBannerShell wizardTarget={wizardTarget}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <ActionBannerEyebrow>{eyebrow}</ActionBannerEyebrow>

          <h3 className="font-display text-[21px] font-medium leading-[1.2] text-alloro-navy">
            {title}
          </h3>

          {description && (
            <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-[1.55] text-alloro-navy">
              {description}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={markDone}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-[10px] border border-alloro-navy/15 bg-white/70 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-alloro-navy transition-colors hover:bg-white"
        >
          <Check size={13} aria-hidden />
          Mark done
        </button>
      </div>
    </ActionBannerShell>
  );
}

export default ActionBanner;
