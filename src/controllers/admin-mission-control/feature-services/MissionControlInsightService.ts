import { runAgent } from "../../../agents/service.llm-runner";
import type { MissionControlData } from "./MissionControlService";

export interface MissionControlInsight {
  headline: string;
  narrative: string;
  bullets: string[];
  source: "ai" | "deterministic";
}

export async function generateMissionControlInsight(
  data: MissionControlData,
): Promise<MissionControlInsight> {
  const fallback = buildFallbackInsight(data);

  try {
    const result = await runAgent({
      systemPrompt:
        "You analyze an admin revenue dashboard. Use only the supplied aggregate metrics. Do not invent causes. Do not suggest data mutations. Return only JSON with headline, narrative, and bullets.",
      userMessage: JSON.stringify(buildSanitizedPayload(data)),
      maxTokens: 800,
      temperature: 0.2,
      costContext: {
        projectId: null,
        eventType: "admin-mission-control-insight",
        metadata: { generatedAt: data.generatedAt },
      },
    });

    const parsed = result.parsed as Partial<MissionControlInsight> | null;
    if (!parsed?.headline || !parsed?.narrative || !Array.isArray(parsed.bullets)) {
      return fallback;
    }

    return {
      headline: String(parsed.headline).slice(0, 120),
      narrative: String(parsed.narrative).slice(0, 420),
      bullets: parsed.bullets.map((bullet) => String(bullet).slice(0, 180)).slice(0, 4),
      source: "ai",
    };
  } catch {
    return fallback;
  }
}

function buildSanitizedPayload(data: MissionControlData) {
  return {
    generatedAt: data.generatedAt,
    stripeFreshness: data.stripeFreshness,
    summary: data.summary,
    revenueTrend: data.revenueTrend,
    organizationCount: data.organizations.length,
    movementSignals: data.movementSignals,
    riskMix: {
      noPaymentMethod: data.summary.noPaymentMethodCount,
      pastDueOrFailed: data.summary.failedOrPastDueCount,
      canceling: data.summary.cancelingCount,
      adminGrantedActive: data.summary.adminGrantedActiveCount,
    },
    revenueDistribution: data.organizations
      .map((org) => ({
        expectedMonthlyAmount: org.expectedMonthlyAmount,
        monthToDatePaid: org.monthToDatePaid,
        lifetimePaid: org.lifetimePaid,
        stripeStatus: org.stripeStatus,
        riskFlags: org.riskFlags,
      }))
      .slice(0, 100),
  };
}

function buildFallbackInsight(data: MissionControlData): MissionControlInsight {
  const delta = data.summary.monthToDatePaid - data.summary.previousMonthPaid;
  const direction = delta >= 0 ? "ahead of" : "behind";

  return {
    headline: "Revenue and payment movement",
    narrative: `Month-to-date received revenue is $${data.summary.monthToDatePaid.toLocaleString()}, ${direction} last month by $${Math.abs(delta).toLocaleString()}. Expected MRR is $${data.summary.expectedMrr.toLocaleString()} across active Stripe subscriptions.`,
    bullets: data.movementSignals.slice(0, 4),
    source: "deterministic",
  };
}
