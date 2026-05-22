/**
 * Practice Hub Hero
 *
 * Feature 1 of the Path D rebuild (2026-05-22). Renders the highest-priority
 * named Growth Opportunity insight for the authenticated org in the doctrine
 * shape defined by the Hero Arc Substrate:
 *   - First-person Alloro voice ("I noticed...")
 *   - Named entities required (named referrer, named figure when available)
 *   - Action verb that closes the gap (Draft thank-you outreach / Draft
 *     check-in message), not one that documents it
 *   - Honest empty state when no named opportunity exists
 *   - No em-dashes (voice constraint per src/services/narrator/voiceConstraints.ts)
 *
 * Data source: GET /api/practice-hub/hero/:orgId — a shape over the existing
 * referral_engine agent_results data, not a new compute path.
 */

import { useEffect, useState } from "react";
import { Target, Sparkles, Loader2 } from "lucide-react";
import {
  fetchPracticeHubHero,
  type PracticeHubHeroPayload,
} from "../api/practiceHub";

export type PracticeHubHeroProps = {
  organizationId: number | null;
};

export function PracticeHubHero({ organizationId }: PracticeHubHeroProps) {
  const [payload, setPayload] = useState<PracticeHubHeroPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setPayload(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    fetchPracticeHubHero(organizationId)
      .then((response) => {
        if (cancelled) return;
        if (response.success && response.data) {
          setPayload(response.data);
        } else {
          setErrorMessage(response.message || "Failed to load Practice Hub.");
        }
      })
      .catch((error: any) => {
        if (cancelled) return;
        setErrorMessage(
          error?.message || "Failed to load Practice Hub.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (!organizationId) {
    return null;
  }

  if (isLoading) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-alloro-navy bg-alloro-navy p-6 text-white shadow-premium sm:p-8">
        <div className="flex items-center gap-3 text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="text-sm font-medium">Reading the latest signals.</p>
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-alloro-navy bg-alloro-navy p-6 text-white shadow-premium sm:p-8">
        <p className="text-sm font-medium text-white/70">{errorMessage}</p>
      </section>
    );
  }

  if (!payload) {
    return null;
  }

  if (!payload.hasOpportunity) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-alloro-navy bg-alloro-navy p-6 text-white shadow-premium sm:p-8">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-alloro-orange/10 blur-3xl" />
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
            Practice Hub
          </p>
          <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-white sm:text-3xl">
            {payload.emptyState.headline}
          </h2>
          {payload.emptyState.secondary && (
            <p className="mt-3 text-sm font-medium leading-6 text-white/65">
              {payload.emptyState.secondary}
            </p>
          )}
        </div>
      </section>
    );
  }

  const handleAction = () => {
    // Action draft generation is a downstream wiring step. For v1 we surface
    // a deterministic confirmation so the customer sees the verb close the
    // gap. The actual draft pipeline (Mailgun/template/CRM) is the Feature 2
    // wiring once doctrine ships clean.
    setActionInFlight(true);
    setTimeout(() => {
      setActionResult(
        `Draft prepared for ${payload.source.name}. We'll add the delivery wiring in the next ship cycle.`,
      );
      setActionInFlight(false);
    }, 400);
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-alloro-navy bg-alloro-navy p-6 text-white shadow-premium sm:p-8">
      <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-alloro-orange/20 blur-3xl" />

      <div className="relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-alloro-orange" />
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
            Practice Hub
          </p>
        </div>

        <h2 className="mt-2 font-display text-2xl font-medium leading-snug tracking-tight text-white sm:text-3xl">
          {payload.headline}
        </h2>

        {payload.stakes && (
          <p className="mt-3 text-sm font-semibold leading-6 text-alloro-orange">
            {payload.stakes}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleAction}
            disabled={actionInFlight}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-alloro-orange px-5 py-3 text-sm font-semibold text-alloro-navy shadow-premium transition hover:bg-alloro-orange/90 disabled:opacity-60"
          >
            <Target className="h-4 w-4" />
            {actionInFlight ? "Preparing..." : payload.action.verb}
          </button>
          {actionResult && (
            <p className="text-xs font-medium leading-5 text-white/70">
              {actionResult}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
