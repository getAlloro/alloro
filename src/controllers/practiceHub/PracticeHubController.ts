/**
 * Practice Hub Hero Controller
 *
 * Feature 1 of the Path D rebuild (2026-05-22). Surfaces the highest-priority
 * Growth Opportunity insight for the authenticated org in the doctrine shape
 * defined by the Hero Arc Substrate (notion.so/368fdaf120c4811cb7b8ed71bda6a858):
 * named source, named delta, named dollar (when available), action verb that
 * closes the gap. Honest empty state when no named opportunity exists.
 *
 * Data source: the latest `referral_engine` agent_results row for the org
 * (same source `getLatestReferralEngineOutput` reads). The Hero is a *shape*
 * over existing data, not a new data path — so this endpoint coexists with
 * the existing referral engine fetch without duplication.
 *
 * Auth: authenticateToken + rbacMiddleware. RBAC populates req.organizationId;
 * the :orgId path param is a fallback for callers that pass it explicitly and
 * is validated against the authenticated org to prevent cross-org reads.
 */

import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import { AgentResultModel } from "../../models/AgentResultModel";

// ---------------------------------------------------------------------
// Hero payload shape
// ---------------------------------------------------------------------

type HeroAction = {
  verb: string;
  type: "draft_outreach" | "draft_checkin" | "review_data";
};

type HeroSource = {
  name: string;
  kind: "referrer" | "competitor" | "opportunity";
};

type HeroDelta = {
  label: string;
  direction: "decreasing" | "increasing" | "dormant" | "stable";
};

type HeroDollar = {
  amount: number;
  label: string;
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

type HeroMetadata = {
  sourceAgentResultId: number | null;
  dateRange?: { start: string; end: string };
  organizationId: number;
};

// ---------------------------------------------------------------------
// Referral engine output types (narrow projection of ReferralEngineAgentOutput)
// ---------------------------------------------------------------------
//
// We don't import the full ReferralEngineAgentOutput type because the
// agent_results.agent_output column is stored as JSON and may drift across
// agent versions. Narrow shape here keeps this controller resilient.

type DoctorRow = {
  referrer_name?: string;
  net_production?: number | null;
  trend_label?: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  referred?: number;
};

type ReferralEngineOutput = {
  doctor_referral_matrix?: DoctorRow[];
  growth_opportunity_summary?: {
    estimated_additional_annual_revenue?: number;
  };
  observed_period?: { start_date: string; end_date: string };
};

// ---------------------------------------------------------------------
// GET /api/practice-hub/hero/:orgId
// ---------------------------------------------------------------------

export async function getHero(req: RBACRequest, res: Response): Promise<any> {
  const rbacOrgId = req.organizationId;
  const paramOrgId = parseInt(String(req.params.orgId), 10);

  // Authenticated org must match the requested org. If RBAC has an org and
  // the param is a different number, reject — prevents IDOR.
  if (rbacOrgId && !Number.isNaN(paramOrgId) && paramOrgId !== rbacOrgId) {
    return res.status(403).json({
      success: false,
      error: "ORG_MISMATCH",
      message: "Authenticated org does not match requested org",
    });
  }

  const organizationId = rbacOrgId ?? paramOrgId;

  if (!organizationId || Number.isNaN(organizationId)) {
    return res.status(400).json({
      success: false,
      error: "INVALID_ORG_ID",
      message: "Missing or invalid orgId",
    });
  }

  try {
    const result = await AgentResultModel.findLatestByOrganizationAndAgent(
      organizationId,
      "referral_engine",
      null,
    );

    const metadata: HeroMetadata = {
      sourceAgentResultId: result?.id ?? null,
      dateRange:
        result && result.date_start && result.date_end
          ? { start: result.date_start, end: result.date_end }
          : undefined,
      organizationId,
    };

    if (!result || !result.agent_output) {
      return res.json({
        success: true,
        data: buildEmptyState(
          "Referral intelligence is still gathering. Check back after your next monthly run.",
          undefined,
          metadata,
        ),
      });
    }

    const output = result.agent_output as ReferralEngineOutput;
    const payload = shapeHero(output, metadata);

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error("[PracticeHubController.getHero] Error:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch Practice Hub Hero",
    });
  }
}

// ---------------------------------------------------------------------
// Hero shaping logic
// ---------------------------------------------------------------------
//
// Doctrine: named source required, action verb closes the gap. We scan
// doctor_referral_matrix for the highest-leverage NAMED drift (a referrer
// trending decreasing or dormant). If no named drift exists, we return an
// honest empty state rather than rendering a generic insight.

function shapeHero(
  output: ReferralEngineOutput,
  metadata: HeroMetadata,
): PracticeHubHeroPayload {
  const doctorRow = pickHighestLeverageDrift(output.doctor_referral_matrix);

  if (!doctorRow) {
    return buildEmptyState(
      "No named referrer drift this period. Your referral mix is stable.",
      "We'll surface a named opportunity here when one appears.",
      metadata,
    );
  }

  const name = (doctorRow.referrer_name ?? "").trim();
  if (!name) {
    return buildEmptyState(
      "No named referrer drift this period. Your referral mix is stable.",
      undefined,
      metadata,
    );
  }

  const directionLabel =
    doctorRow.trend_label === "dormant" ? "stopped sending" : "are declining";

  const headline = buildHeadline(name, directionLabel, doctorRow);
  const stakes = buildStakes(
    output.growth_opportunity_summary?.estimated_additional_annual_revenue,
    doctorRow.net_production,
  );

  const action: HeroAction =
    doctorRow.trend_label === "dormant"
      ? {
          verb: `Draft thank-you outreach to ${name}`,
          type: "draft_outreach",
        }
      : {
          verb: `Draft check-in message to ${name}`,
          type: "draft_checkin",
        };

  return {
    hasOpportunity: true,
    headline,
    stakes,
    source: { name, kind: "referrer" },
    delta: {
      label: directionLabel,
      direction:
        doctorRow.trend_label === "dormant" ? "dormant" : "decreasing",
    },
    dollar: dollarFromNet(doctorRow.net_production),
    action,
    metadata,
  };
}

function pickHighestLeverageDrift(
  matrix: DoctorRow[] | undefined,
): DoctorRow | null {
  if (!matrix || matrix.length === 0) return null;

  // First pass: decreasing trend with highest net_production (most $ at risk)
  const decreasing = matrix
    .filter(
      (d) =>
        d.trend_label === "decreasing" &&
        typeof d.referrer_name === "string" &&
        d.referrer_name.trim().length > 0,
    )
    .sort(
      (a, b) =>
        (b.net_production ?? 0) - (a.net_production ?? 0),
    );

  if (decreasing.length > 0) return decreasing[0];

  // Second pass: dormant referrers (stopped sending entirely)
  const dormant = matrix
    .filter(
      (d) =>
        d.trend_label === "dormant" &&
        typeof d.referrer_name === "string" &&
        d.referrer_name.trim().length > 0,
    )
    .sort(
      (a, b) =>
        (b.net_production ?? 0) - (a.net_production ?? 0),
    );

  if (dormant.length > 0) return dormant[0];

  return null;
}

function buildHeadline(
  name: string,
  directionLabel: string,
  doctorRow: DoctorRow,
): string {
  // First-person Alloro voice. No em-dashes (voice constraint). Period or
  // comma only. Named entity is mandatory and present (caller-guaranteed).
  const referralCount = doctorRow.referred;
  if (typeof referralCount === "number" && referralCount > 0) {
    return `I noticed ${name} ${directionLabel}. ${referralCount} referrals in the latest period.`;
  }
  return `I noticed ${name} ${directionLabel}.`;
}

function buildStakes(
  estimatedAnnualRevenue: number | undefined,
  netProduction: number | null | undefined,
): string | undefined {
  // Per AR-008: any dollar figure should ultimately ship with a calc trace.
  // For v1, the stake is the value of the relationship per the agent's
  // analysis (estimated_additional_annual_revenue) when available, falling
  // back to observed net_production. The frontend can expand the methodology
  // in a later iteration.
  if (
    typeof estimatedAnnualRevenue === "number" &&
    estimatedAnnualRevenue > 0
  ) {
    return `Estimated annual revenue impact: ${formatDollar(
      estimatedAnnualRevenue,
    )}.`;
  }
  if (typeof netProduction === "number" && netProduction > 0) {
    return `Recent referral production: ${formatDollar(netProduction)}.`;
  }
  return undefined;
}

function dollarFromNet(
  netProduction: number | null | undefined,
): HeroDollar | undefined {
  if (typeof netProduction !== "number" || netProduction <= 0) return undefined;
  return {
    amount: netProduction,
    label: formatDollar(netProduction),
  };
}

function formatDollar(amount: number): string {
  // Whole-dollar formatting for headline use. Decimal precision is not
  // doctrine here; "named figure" is the constraint, not significant digits.
  const rounded = Math.round(amount);
  return `$${rounded.toLocaleString("en-US")}`;
}

function buildEmptyState(
  headline: string,
  secondary: string | undefined,
  metadata: HeroMetadata,
): PracticeHubHeroPayload {
  return {
    hasOpportunity: false,
    emptyState: { headline, secondary },
    metadata,
  };
}
