import Anthropic from "@anthropic-ai/sdk";
import {
  aggregatePmsData,
  type AggregatedPmsData,
} from "../../../utils/pms/pmsAggregator";
import { monthSortValue } from "../../../utils/pms/monthKey";
import { safeLogAiCostEvent } from "../../../services/ai-cost/service.ai-cost";

/**
 * PMS Referral Comparison Insights
 *
 * Re-derives two months from the authoritative aggregation (never trusts
 * client-sent numbers) and asks Claude Haiku for a short, owner-readable
 * paragraph comparing them. Mirrors the Haiku-call shape in
 * src/services/reviewSentiment.ts.
 */

const COMPARISON_MODEL = "claude-haiku-4-5-20251001";
const COMPARISON_MAX_TOKENS = 280;
const TOP_SOURCES_IN_PROMPT = 6;

type AggregatedMonth = AggregatedPmsData["months"][number];

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

export interface ComparisonSourceLine {
  name: string;
  referrals: number;
  production: number;
}

export interface ComparisonMonthSummary {
  month: string;
  totalReferrals: number;
  doctorReferrals: number;
  selfReferrals: number;
  production: number;
  topSources: ComparisonSourceLine[];
}

export interface ReferralComparisonResult {
  insight: string;
  monthA: ComparisonMonthSummary;
  monthB: ComparisonMonthSummary;
}

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatMoney = (value: number): string =>
  `$${Math.round(value).toLocaleString("en-US")}`;

function summarizeMonth(month: AggregatedMonth): ComparisonMonthSummary {
  const topSources = (month.sources ?? [])
    .map((source) => ({
      name: String(source.name ?? "").trim(),
      referrals: toNumber(source.referrals),
      production: toNumber(source.production),
    }))
    .filter((source) => source.name.length > 0)
    .sort((a, b) => b.referrals - a.referrals || b.production - a.production)
    .slice(0, TOP_SOURCES_IN_PROMPT);

  return {
    month: month.month,
    totalReferrals: month.totalReferrals,
    doctorReferrals: month.doctorReferrals,
    selfReferrals: month.selfReferrals,
    production: month.productionTotal,
    topSources,
  };
}

type SourceMoveStatus = "new" | "gone" | "up" | "down" | "flat";

interface SourceMove {
  name: string;
  referralsA: number;
  referralsB: number;
  delta: number;
  status: SourceMoveStatus;
}

/** Per-source referral movement from month A to month B, biggest mover first. */
function buildSourceMoves(
  monthA: AggregatedMonth,
  monthB: AggregatedMonth
): SourceMove[] {
  const toMap = (month: AggregatedMonth): Map<string, number> => {
    const map = new Map<string, number>();
    for (const source of month.sources ?? []) {
      const name = String(source.name ?? "").trim();
      if (name) map.set(name, toNumber(source.referrals));
    }
    return map;
  };
  const mapA = toMap(monthA);
  const mapB = toMap(monthB);
  const names = new Set([...mapA.keys(), ...mapB.keys()]);

  const moves: SourceMove[] = [];
  for (const name of names) {
    const referralsA = mapA.get(name) ?? 0;
    const referralsB = mapB.get(name) ?? 0;
    const inA = mapA.has(name);
    const inB = mapB.has(name);
    let status: SourceMoveStatus;
    if (!inA && inB) status = "new";
    else if (inA && !inB) status = "gone";
    else if (referralsB > referralsA) status = "up";
    else if (referralsB < referralsA) status = "down";
    else status = "flat";
    moves.push({
      name,
      referralsA,
      referralsB,
      delta: referralsB - referralsA,
      status,
    });
  }
  return moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function formatMovesForPrompt(moves: SourceMove[]): string {
  const notable = moves.filter((move) => move.status !== "flat").slice(0, 6);
  if (!notable.length) return "  (no notable source moves)";
  return notable
    .map(
      (move) =>
        `  - ${move.name}: ${move.referralsA} -> ${move.referralsB} (${move.status})`
    )
    .join("\n");
}

function buildComparisonPrompt(
  a: ComparisonMonthSummary,
  b: ComparisonMonthSummary,
  moves: SourceMove[]
): string {
  return `You are a dental and orthodontic practice analyst. Compare two months of referral data for one practice and write a short, plain-English summary for the practice owner.

MONTH A (${a.month}):
- Total referrals: ${a.totalReferrals} (doctor ${a.doctorReferrals}, self ${a.selfReferrals})
- Production: ${formatMoney(a.production)}

MONTH B (${b.month}):
- Total referrals: ${b.totalReferrals} (doctor ${b.doctorReferrals}, self ${b.selfReferrals})
- Production: ${formatMoney(b.production)}

Notable referral-source moves from A to B (referrals A -> B):
${formatMovesForPrompt(moves)}

Write TWO or THREE sentences, under 55 words total. Lead with the biggest change in production and total referrals between the two months, with specific numbers. Then, if a referral source clearly stands out (newly appeared, disappeared, or a sharp swing), name that source and its numbers in one sentence; if nothing stands out, skip it. Wrap the 2 to 4 most important phrases (the key figures and the standout source name) in double equal signs for emphasis, like ==this==. No bullet points, no headings, no em-dashes. Plain text only.`;
}

/**
 * Generate the comparison insight. Throws a status-coded error (handled by the
 * controller's handleError) when a requested month has no data.
 */
export async function generateReferralComparisonInsight(params: {
  organizationId: number;
  locationId?: number | null;
  monthA: string;
  monthB: string;
}): Promise<ReferralComparisonResult> {
  const { organizationId, locationId, monthA, monthB } = params;

  const aggregated = await aggregatePmsData(
    organizationId,
    locationId ?? undefined
  );

  const findMonth = (key: string): AggregatedMonth | undefined =>
    aggregated.months.find(
      (m) => m.month === key || monthSortValue(m.month) === monthSortValue(key)
    );

  const resolvedA = findMonth(monthA);
  const resolvedB = findMonth(monthB);
  if (!resolvedA) {
    throw Object.assign(new Error(`No PMS data found for month "${monthA}"`), {
      statusCode: 404,
    });
  }
  if (!resolvedB) {
    throw Object.assign(new Error(`No PMS data found for month "${monthB}"`), {
      statusCode: 404,
    });
  }

  const summaryA = summarizeMonth(resolvedA);
  const summaryB = summarizeMonth(resolvedB);
  const sourceMoves = buildSourceMoves(resolvedA, resolvedB);

  const response = await getAnthropic().messages.create({
    model: COMPARISON_MODEL,
    max_tokens: COMPARISON_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: buildComparisonPrompt(summaryA, summaryB, sourceMoves),
      },
    ],
  });

  const insight =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!insight) {
    throw Object.assign(
      new Error("The comparison summary came back empty. Please try again."),
      { statusCode: 502 }
    );
  }

  await safeLogAiCostEvent({
    projectId: null,
    eventType: "pms-referral-comparison",
    model: response.model,
    usage: {
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
    },
    metadata: {
      organizationId,
      locationId: locationId ?? null,
      monthA: resolvedA.month,
      monthB: resolvedB.month,
    },
  });

  return { insight, monthA: summaryA, monthB: summaryB };
}
