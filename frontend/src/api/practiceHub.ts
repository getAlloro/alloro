import { apiGet } from "./index";

// ---------------------------------------------------------------------
// Hero payload — mirrors PracticeHubHeroPayload in
// src/controllers/practiceHub/PracticeHubController.ts.
// ---------------------------------------------------------------------

export type HeroAction = {
  verb: string;
  type: "draft_outreach" | "draft_checkin" | "review_data";
};

export type HeroSource = {
  name: string;
  kind: "referrer" | "competitor" | "opportunity";
};

export type HeroDelta = {
  label: string;
  direction: "decreasing" | "increasing" | "dormant" | "stable";
};

export type HeroDollar = {
  amount: number;
  label: string;
};

export type HeroMetadata = {
  sourceAgentResultId: number | null;
  dateRange?: { start: string; end: string };
  organizationId: number;
};

export type PracticeHubHeroPayload =
  | {
      hasOpportunity: true;
      headline: string;
      stakes?: string;
      source: HeroSource;
      delta: HeroDelta;
      dollar?: HeroDollar;
      action: HeroAction;
      metadata: HeroMetadata;
    }
  | {
      hasOpportunity: false;
      emptyState: {
        headline: string;
        secondary?: string;
      };
      metadata: HeroMetadata;
    };

export type PracticeHubHeroResponse = {
  success: boolean;
  data: PracticeHubHeroPayload;
  error?: string;
  message?: string;
};

/**
 * Fetch the Practice Hub Hero payload for the given org.
 *
 * The orgId path param is validated against the authenticated session
 * server-side; cross-org reads are rejected. Pass the org from
 * useLocationContext or auth state.
 */
export const fetchPracticeHubHero = async (
  orgId: number,
): Promise<PracticeHubHeroResponse> => {
  return apiGet({ path: `/practice-hub/hero/${orgId}` });
};
