import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useIsWizardActive } from "../../../contexts/OnboardingWizardContext";
import { useTopAction } from "../../../hooks/queries/useTopAction";
import { formatGeneratedCopyForOrg } from "../../../utils/generatedCopy";

function ComparisonSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading local review comparison"
      className="rounded-xl border border-alloro-navy/10 bg-alloro-navy/[0.025] px-6 py-5"
    >
      <div className="h-3 w-40 animate-pulse rounded bg-neutral-100" />
      <div className="mt-3 h-5 w-80 max-w-full animate-pulse rounded bg-neutral-100" />
      <div className="mt-2 h-4 w-full animate-pulse rounded bg-neutral-100" />
    </section>
  );
}

export function ChoosableComparisonStrip() {
  const shouldReduceMotion = useReducedMotion();
  const isWizardActive = useIsWizardActive();
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;
  const { latestChoosableSummary, isLoading, error } = useTopAction(
    orgId,
    locationId
  );

  if (isWizardActive) return null;
  if (isLoading) return <ComparisonSkeleton />;
  if (error || !latestChoosableSummary) return null;

  const summary = formatGeneratedCopyForOrg(
    latestChoosableSummary.summary,
    userProfile?.organizationType
  );
  const detail = formatGeneratedCopyForOrg(
    latestChoosableSummary.detail,
    userProfile?.organizationType
  );

  return (
    <motion.section
      aria-label="Local review comparison"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.25, ease: "easeOut" }}
      className="rounded-xl border border-alloro-navy/10 bg-alloro-navy/[0.025] px-6 py-5 shadow-premium"
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-teal">
        <span className="h-1.5 w-1.5 rounded-full bg-alloro-teal" />
        Local review comparison
      </div>
      <h3 className="mt-2 font-display text-xl font-medium leading-tight text-alloro-navy">
        {summary}
      </h3>
      <p className="mt-1.5 max-w-[760px] text-[13.5px] leading-relaxed text-ink-muted">
        {detail}
      </p>
    </motion.section>
  );
}
