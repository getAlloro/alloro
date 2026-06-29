import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useTopAction, type ResolvedTopAction } from "../../../hooks/queries/useTopAction";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../../contexts/OnboardingWizardContext";
import {
  ActionBanner,
  ActionBannerEyebrow,
  ActionBannerShell,
} from "../ActionBanner";
import { formatGeneratedCopyForOrg } from "../../../utils/generatedCopy";

/**
 * OneThingBanner — the "1 thing that matters" strip for the simplified
 * Practice Hub: the SUMMARY agent's top action rendered through the shared
 * ActionBanner (one visual language + Mark done across all three hubs).
 *
 * Spec: plans/06092026-practice-hub-simplification/spec.html (T3, Rev 3)
 *       plans/06112026-design-consistency-pass (shared banner + mark-done)
 */

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
      <ActionBannerShell wizardTarget="dashboard-hero">
        <ActionBannerEyebrow>This month · 1 thing that matters</ActionBannerEyebrow>
        <div className="h-6 w-72 max-w-full animate-pulse rounded bg-accent-soft-line" />
        <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-accent-soft-line" />
      </ActionBannerShell>
    );
  }

  // No prioritized action → calm "all caught up" state.
  if (!action) {
    return (
      <ActionBannerShell wizardTarget="dashboard-hero">
        <ActionBannerEyebrow>This month</ActionBannerEyebrow>
        <h3 className="font-display text-xl text-alloro-navy">You're all caught up.</h3>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          No urgent action right now. We'll surface the next priority as it appears.
        </p>
      </ActionBannerShell>
    );
  }

  return (
    <ActionBanner
      hub="practice-hub"
      eyebrow="This month · 1 thing that matters"
      title={formatGeneratedCopyForOrg(
        action.title,
        userProfile?.organizationType,
      )}
      description={formatGeneratedCopyForOrg(
        action.rationale,
        userProfile?.organizationType,
      )}
      wizardTarget="dashboard-hero"
    />
  );
}

export default OneThingBanner;
