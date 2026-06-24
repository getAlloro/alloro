/**
 * PatientJourneyAction — the "1 thing that matters" card under the funnel.
 *
 * A descriptive call-out tied to the funnel's biggest leak (never a
 * prediction). Split out of PatientJourneyDashboard so the surface's render
 * stays within the §13.1 size guidance. Renders nothing when there is no
 * identified leak stage.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T7)
 */

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import type { PatientJourneyHeadline } from "../../../types/patientJourney";

interface PatientJourneyActionProps {
  headline: PatientJourneyHeadline;
}

export function PatientJourneyAction({ headline }: PatientJourneyActionProps) {
  if (!headline.leakStageKey) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-[14px] border border-accent-soft-line bg-accent-soft px-7 py-6 shadow-premium"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-alloro-orange">
          This month &middot; 1 thing that matters
        </p>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-accent-soft-line bg-white px-4 py-2 text-[13px] font-semibold text-alloro-navy">
          <Check className="h-[15px] w-[15px]" />
          Fix the biggest leak
        </span>
      </div>
      <h2 className="mt-2.5 font-display text-[22px] leading-snug text-alloro-navy">
        Fix the step where most visitors drop off
      </h2>
      <p className="mt-2 max-w-[760px] text-[13.5px] leading-relaxed text-alloro-navy/80">
        {headline.text}
      </p>
    </motion.section>
  );
}
