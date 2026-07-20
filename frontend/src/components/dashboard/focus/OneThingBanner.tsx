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
import { STAGE_LABEL, buildHealthVerdict, resolveActionStage } from "./verdict";
import { useStageTones } from "./useStageTones";

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
  const stageTones = useStageTones();

  const action: ResolvedTopAction | null =
    isWizardActive && wizard
      ? (wizard.heroAction as ResolvedTopAction)
      : realTopAction;

  // FIX 2: the 30-second health/leak verdict, from the SAME tones as the stat
  // dots (real-data path only; the wizard tour drives its own demo hero).
  const verdict = isWizardActive ? null : buildHealthVerdict(stageTones);

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

  // FIX 3: the eyebrow names the ACTION's journey stage, DERIVED from the
  // action's domain — never the LLM-authored `stage` field, which could label a
  // GBP post "findable" and quietly undo the post-does-not-rank rule. See
  // resolveActionStage.
  const actionStage = resolveActionStage(action);
  const eyebrow = actionStage
    ? `This month · ${STAGE_LABEL[actionStage]} · 1 thing that matters`
    : "This month · 1 thing that matters";

  return (
    <div className="flex flex-col gap-2">
      {verdict && (
        <p className="px-1 text-[13.5px] font-medium leading-snug text-alloro-navy">
          {verdict.text}
        </p>
      )}
      <ActionBanner
        hub="practice-hub"
        eyebrow={eyebrow}
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
    </div>
  );
}

export default OneThingBanner;
