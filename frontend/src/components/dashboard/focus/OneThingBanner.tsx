import type { ReactNode } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useTopAction, type ResolvedTopAction } from "../../../hooks/queries/useTopAction";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../../contexts/OnboardingWizardContext";

/**
 * OneThingBanner — the "1 thing that matters" strip for the simplified
 * Practice Hub. A minimal render of the SUMMARY agent's top action
 * (eyebrow + title + one-line rationale), replacing the old heavy dark
 * Hero card.
 *
 * Spec: plans/06092026-practice-hub-simplification/spec.html (T3, Rev 3)
 */

const BANNER_BG = "#FAF1EC";
const BANNER_BORDER = "#EFDED4";
const EYEBROW = "#B3503E";
const INK = "#1F1B16";
const INK_SOFT = "#3A342B";
const MUTED = "#8E8579";

function Shell({ children }: { children: ReactNode }) {
  return (
    <section
      data-wizard-target="dashboard-hero"
      style={{
        background: BANNER_BG,
        border: `1px solid ${BANNER_BORDER}`,
        borderRadius: 14,
        padding: "20px 22px",
      }}
    >
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-1.5 font-bold uppercase"
      style={{ color: EYEBROW, fontSize: 10, letterSpacing: "0.16em" }}
    >
      {children}
    </div>
  );
}

export function OneThingBanner() {
  const isWizardActive = useIsWizardActive();
  const wizard = useWizardDemoData();
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const { topAction: realTopAction, isLoading } = useTopAction(orgId, locationId);

  const action: ResolvedTopAction | null =
    isWizardActive && wizard
      ? (wizard.heroAction as ResolvedTopAction)
      : realTopAction;

  if (!isWizardActive && isLoading) {
    return (
      <Shell>
        <Eyebrow>This month · 1 thing that matters</Eyebrow>
        <div className="h-6 w-72 max-w-full animate-pulse rounded bg-[#F0E2DA]" />
        <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-[#F0E2DA]" />
      </Shell>
    );
  }

  // No prioritized action → calm "all caught up" state.
  if (!action) {
    return (
      <Shell>
        <Eyebrow>This month</Eyebrow>
        <h3 className="font-display" style={{ fontSize: 20, color: INK }}>
          You're all caught up.
        </h3>
        <p className="mt-1" style={{ fontSize: 13.5, color: MUTED }}>
          No urgent action right now. We'll surface the next priority as it appears.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Eyebrow>This month · 1 thing that matters</Eyebrow>

      <h3
        className="font-display"
        style={{ fontSize: 21, lineHeight: 1.2, color: INK, fontWeight: 500 }}
      >
        {action.title}
      </h3>

      <p
        className="mt-1.5"
        style={{ fontSize: 13.5, lineHeight: 1.55, color: INK_SOFT, maxWidth: 720 }}
      >
        {action.rationale}
      </p>
    </Shell>
  );
}

export default OneThingBanner;
