/**
 * Intelligence Agent -- Execution Service
 *
 * Runs daily at 5 AM PT. For each org with ranking data, queries
 * weekly_ranking_snapshots, behavioral_events, and referral_sources.
 * Produces 3 findings with the biological-economic lens (human need
 * + dollar consequence). Uses Claude API to synthesize findings from
 * raw data, falling back to template findings if ANTHROPIC_API_KEY
 * is not set.
 *
 * Writes findings to behavioral_events as "intelligence.finding".
 */

import { db } from "../../database/connection";
import { getAlloroSubstrate } from "../prompt/alloroSubstrate";
import {
  prepareAgentContext,
  recordAgentAction,
  closeLoop,
  type RuntimeContext,
} from "./agentRuntime";

// ── Types ───────────────────────────────────────────────────────────

interface IntelligenceFinding {
  headline: string;
  detail: string;
  humanNeed: "safety" | "belonging" | "purpose" | "status";
  economicConsequence: {
    thirtyDay: string;
    ninetyDay: string;
    yearDay: string;
  };
}

interface IntelligenceSummary {
  orgId: number;
  orgName: string;
  findings: IntelligenceFinding[];
  generatedAt: string;
}

// ── Case value defaults ─────────────────────────────────────────────

const DEFAULT_CASE_VALUE = 500; // Universal fallback, overridden by vocabulary lookup

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run Intelligence Agent for a single org.
 * Returns up to 3 findings with the biological-economic lens.
 */
export async function runIntelligenceForOrg(
  orgId: number,
): Promise<IntelligenceSummary | null> {
  const agentCtx = { agentName: "intelligence_agent", orgId, topic: "intelligence_findings" };

  // Prepare runtime context (events, heuristics, orchestrator check)
  const runtime = await prepareAgentContext(agentCtx);

  if (!runtime.orchestratorApproval.allowed) {
    console.log(
      `[IntelligenceAgent] Blocked by orchestrator for org ${orgId}: ${runtime.orchestratorApproval.reason}`,
    );
    return null;
  }

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return null;

  // Gather raw data
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(4);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentEvents = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("created_at", ">=", sevenDaysAgo)
    .orderBy("created_at", "desc")
    .limit(50);

  const referralSources = await db("referral_sources")
    .where({ org_id: orgId })
    .orderBy("updated_at", "desc")
    .limit(20);

  // Build context for synthesis
  const context = await buildContext(org, snapshots, recentEvents, referralSources);

  // Attempt Claude synthesis (with heuristics injected), fall back to template findings
  let findings: IntelligenceFinding[];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      findings = await synthesizeWithClaude(context, runtime);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[IntelligenceAgent] Claude synthesis failed for org ${orgId}, using templates:`,
        message,
      );
      findings = generateTemplateFindings(context);
    }
  } else {
    console.log(
      "[IntelligenceAgent] No ANTHROPIC_API_KEY set, using template findings",
    );
    findings = generateTemplateFindings(context);
  }

  // Write findings to behavioral_events
  for (const finding of findings) {
    await db("behavioral_events")
      .insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "intelligence.finding",
        org_id: orgId,
        properties: JSON.stringify({
          headline: finding.headline,
          detail: finding.detail,
          humanNeed: finding.humanNeed,
          economicConsequence: finding.economicConsequence,
        }),
        created_at: new Date(),
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[IntelligenceAgent] Failed to write finding for org ${orgId}:`,
          message,
        );
      });
  }

  const summary: IntelligenceSummary = {
    orgId,
    orgName: org.name,
    findings,
    generatedAt: new Date().toISOString(),
  };

  // Record the agent action
  await recordAgentAction(agentCtx, {
    type: "findings_produced",
    headline: `${findings.length} finding(s) produced for ${org.name}`,
    detail: findings.map((f) => f.headline).join("; "),
    humanNeed: findings[0]?.humanNeed,
    economicConsequence: findings[0]?.economicConsequence?.thirtyDay,
  });

  // Close the loop
  await closeLoop(agentCtx, {
    expected: "Produce 3 intelligence findings with biological-economic lens",
    actual: `${findings.length} finding(s) produced for ${org.name}`,
    success: findings.length > 0,
    learning:
      findings.length < 3
        ? `Only produced ${findings.length}/3 findings, may need more data`
        : undefined,
  });

  console.log(
    `[IntelligenceAgent] ${org.name}: ${findings.length} finding(s) produced`,
  );
  return summary;
}

/**
 * Run Intelligence Agent for ALL orgs with ranking data.
 */
export async function runIntelligenceForAll(): Promise<{
  scanned: number;
  totalFindings: number;
}> {
  const orgIds = await db("weekly_ranking_snapshots")
    .select("org_id")
    .groupBy("org_id")
    .havingRaw("count(*) >= 1");

  let scanned = 0;
  let totalFindings = 0;

  for (const row of orgIds) {
    try {
      const summary = await runIntelligenceForOrg(row.org_id);
      if (summary) {
        scanned++;
        totalFindings += summary.findings.length;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[IntelligenceAgent] Failed for org ${row.org_id}:`,
        message,
      );
    }
  }

  console.log(
    `[IntelligenceAgent] Scanned ${scanned} orgs, ${totalFindings} total findings`,
  );
  return { scanned, totalFindings };
}

// ── Context Builder ─────────────────────────────────────────────────

interface OrgContext {
  orgName: string;
  orgId: number;
  snapshotSummary: string;
  eventSummary: string;
  referralSummary: string;
  rankingHistory: string;
  topCompetitor: string | null;
  topCompetitorReviews: number;
  clientReviews: number;
  coldReferralSources: string[];
  topReferralSources: string[];
  caseValue: number;
  specialty: string;
}

async function buildContext(
  org: any,
  snapshots: any[],
  events: any[],
  referralSources: any[],
): Promise<OrgContext> {
  const snapshotLines = snapshots.map((s: any) => {
    return `Week ${s.week_start}: position #${s.client_position ?? "N/A"}, reviews ${s.client_review_count ?? 0}, competitor ${s.competitor_name ?? "none"} at ${s.competitor_review_count ?? 0} reviews`;
  });

  const eventTypes: Record<string, number> = {};
  for (const e of events) {
    const t = e.event_type || "unknown";
    eventTypes[t] = (eventTypes[t] || 0) + 1;
  }
  const eventLines = Object.entries(eventTypes).map(
    ([type, count]) => `${type}: ${count}`,
  );

  const referralLines = referralSources.slice(0, 5).map((r: any) => {
    return `${r.source_name || "Unknown"}: ${r.referral_count ?? 0} referrals`;
  });

  // Look up avgCaseValue from vocabulary config for the org's vertical
  let caseValue = DEFAULT_CASE_VALUE;
  try {
    const config = await db("vocabulary_configs").where({ org_id: org.id }).first();
    if (config?.vertical) {
      const defaults = await db("vocabulary_defaults").where({ vertical: config.vertical }).first();
      if (defaults?.config) {
        const parsed = typeof defaults.config === "string" ? JSON.parse(defaults.config) : defaults.config;
        if (parsed.avgCaseValue) caseValue = parsed.avgCaseValue;
      }
    }
  } catch {
    // Fall through to default
  }

  // Pull ranking history with named competitors from practice_rankings
  const rankings = await db("practice_rankings")
    .where({ organization_id: org.id, status: "completed" })
    .orderBy("created_at", "desc")
    .limit(10);

  const rankingHistoryLines = rankings.map((r: any) => {
    const date = new Date(r.created_at).toISOString().split("T")[0];
    return `${date}: #${r.rank_position}/${r.total_competitors} ${r.specialty} (${r.gbp_location_name || org.name})`;
  });

  // Extract top competitor from ranking raw_data
  let topCompetitor: string | null = null;
  let topCompetitorReviews = 0;
  let clientReviews = 0;
  if (rankings.length > 0 && rankings[0].raw_data) {
    const raw = typeof rankings[0].raw_data === "string" ? JSON.parse(rankings[0].raw_data) : rankings[0].raw_data;
    const competitors = raw?.competitors || raw?.competitorData || [];
    if (competitors.length > 0) {
      const top = competitors[0];
      topCompetitor = top.name || top.displayName || null;
      topCompetitorReviews = top.reviewsCount || top.userRatingCount || 0;
    }
    clientReviews = raw?.clientReviews || raw?.reviewCount || 0;
  }

  // Pull PMS data for individual referral source names and changes
  const pmsJob = await db("pms_jobs")
    .where({ organization_id: org.id })
    .orderBy("timestamp", "desc")
    .first();

  const coldSources: string[] = [];
  const topSources: string[] = [];

  if (pmsJob?.raw_input_data) {
    const rawPms = typeof pmsJob.raw_input_data === "string" ? JSON.parse(pmsJob.raw_input_data) : pmsJob.raw_input_data;
    if (Array.isArray(rawPms)) {
      // Count referrals per source
      const sourceCounts: Record<string, number> = {};
      for (const record of rawPms) {
        const source = record["Referral Source"] || record["Referring source"] || record["referral_source"] || "";
        if (source) sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      }
      // Sort by count
      const sorted = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
      // Top 5 sources
      for (const [name, count] of sorted.slice(0, 5)) {
        topSources.push(`${name} (${count} referrals)`);
      }
      // Cold sources: those with only 1 referral (potentially dropping off)
      for (const [name, count] of sorted) {
        if (count === 1 && !name.toLowerCase().includes("website") && !name.toLowerCase().includes("self")) {
          coldSources.push(name);
        }
      }
    }
  }

  // Get specialty from vocabulary config
  let specialty = "local business";
  try {
    const vocabConfig = await db("vocabulary_configs").where({ org_id: org.id }).first();
    if (vocabConfig?.vertical) specialty = vocabConfig.vertical;
  } catch { /* fallback */ }

  return {
    orgName: org.name,
    orgId: org.id,
    snapshotSummary: snapshotLines.join("\n") || "No ranking snapshots",
    eventSummary: eventLines.join(", ") || "No recent events",
    referralSummary: referralLines.join("\n") || "No referral sources",
    rankingHistory: rankingHistoryLines.join("\n") || "No ranking history",
    topCompetitor,
    topCompetitorReviews,
    clientReviews,
    coldReferralSources: coldSources.slice(0, 5),
    topReferralSources: topSources.slice(0, 5),
    caseValue,
    specialty,
  };
}

// ── Claude Synthesis ────────────────────────────────────────────────

async function synthesizeWithClaude(
  context: OrgContext,
  runtime?: RuntimeContext,
): Promise<IntelligenceFinding[]> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  // Build heuristic guidance section from Knowledge Bridge
  let heuristicSection = "";
  if (runtime?.heuristics && runtime.heuristics.length > 0) {
    heuristicSection = `

KNOWLEDGE LATTICE HEURISTICS (apply these lenses to your analysis):
${runtime.heuristics.map((h, i) => `${i + 1}. ${h}`).join("\n")}
`;
  }

  const prompt = `You are the Intelligence Agent for Alloro. You produce findings that make business owners say "how did they know that?"

The difference between a report and intelligence:
- Report: "You have 71 reviews at 5.0 stars." (they know this)
- Intelligence: "Sackawitz Orthodontics added 15 reviews this month. You added 2. At this rate, he erases your rating advantage by August." (they didn't know this)

Every finding must:
1. NAME a specific competitor or referral source (never say "a competitor" or "your top referral source")
2. Include a specific number or percentage that the owner didn't know
3. Explain WHY it matters in one sentence (the teaching moment)
4. Give ONE specific action with enough detail that front desk staff could execute it
5. Attach the dollar consequence at 30, 90, and 365 days

Practice: ${context.orgName} (${context.specialty})
Case value: $${context.caseValue}

COMPETITIVE POSITION HISTORY:
${context.rankingHistory}
${context.topCompetitor ? `Top competitor: ${context.topCompetitor} (${context.topCompetitorReviews} reviews vs your ${context.clientReviews})` : ""}

WEEKLY RANKING SNAPSHOTS:
${context.snapshotSummary}

TOP REFERRAL SOURCES (from PMS data):
${context.topReferralSources.length > 0 ? context.topReferralSources.join("\n") : "No PMS data available"}

REFERRAL SOURCES WITH ONLY 1 REFERRAL (potentially going cold):
${context.coldReferralSources.length > 0 ? context.coldReferralSources.join(", ") : "None detected"}

RECENT BEHAVIORAL EVENTS:
${context.eventSummary}
${heuristicSection}
Produce exactly 3 findings as a JSON array. Each finding:
- headline: one sentence naming a specific entity (competitor or referral source) and a specific number
- detail: 2-3 sentences. First sentence: what happened (the Oz moment). Second: why it matters (the teaching). Third: exactly what to do about it (the action, specific enough for front desk staff).
- humanNeed: "safety" | "belonging" | "purpose" | "status"
- economicConsequence: { thirtyDay, ninetyDay, yearDay } with dollar strings

Never use em-dashes. Use commas or periods instead.
Return ONLY the JSON array, no markdown fences.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: getAlloroSubstrate(),
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 3).map((f: any) => ({
        headline: String(f.headline || ""),
        detail: String(f.detail || ""),
        humanNeed: f.humanNeed || "safety",
        economicConsequence: {
          thirtyDay: String(f.economicConsequence?.thirtyDay || "$0"),
          ninetyDay: String(f.economicConsequence?.ninetyDay || "$0"),
          yearDay: String(f.economicConsequence?.yearDay || "$0"),
        },
      }));
    }
  } catch {
    // Fall through to template
  }

  return generateTemplateFindings(context);
}

// ── Template Findings (fallback) ────────────────────────────────────

function generateTemplateFindings(context: OrgContext): IntelligenceFinding[] {
  const findings: IntelligenceFinding[] = [];
  const cv = context.caseValue;

  // Finding 1: Competitive position with named competitor
  if (context.topCompetitor) {
    const reviewGap = context.topCompetitorReviews - context.clientReviews;
    const gapDirection = reviewGap > 0 ? "ahead of you" : "behind you";
    findings.push({
      headline: `${context.topCompetitor} has ${context.topCompetitorReviews} reviews, ${Math.abs(reviewGap)} ${gapDirection}`,
      detail: `${context.topCompetitor} is your closest competitor in the local market with ${context.topCompetitorReviews} reviews compared to your ${context.clientReviews}. ${reviewGap > 0 ? "Closing this gap requires consistent review requests after every appointment. Practices that ask at checkout get 4x the response rate vs follow-up emails." : "Your review lead is a real competitive advantage, but it needs to be maintained. A competitor adding 10+ reviews in a month can shift local rankings in weeks."} Ask your front desk to request a review from every patient at checkout this week.`,
      humanNeed: "status",
      economicConsequence: {
        thirtyDay: `$${cv * 2} if ranking position shifts`,
        ninetyDay: `$${cv * 6} if the gap widens over a quarter`,
        yearDay: `$${cv * 18} annual impact from competitive position change`,
      },
    });
  } else {
    findings.push({
      headline: `Your local competitive landscape needs monitoring`,
      detail: `We don't yet have detailed competitor data for your market. Once your ranking analysis completes, you will see exactly who you are competing with, their review counts, and where the opportunities are. This typically updates within your first week.`,
      humanNeed: "safety",
      economicConsequence: {
        thirtyDay: `$${cv} per missed opportunity while unmonitored`,
        ninetyDay: `$${cv * 4} if a competitor gains ground unnoticed`,
        yearDay: `$${cv * 12} annual from competitive blind spots`,
      },
    });
  }

  // Finding 2: Top referral source (named) or referral network
  if (context.topReferralSources.length > 0) {
    const topSource = context.topReferralSources[0];
    findings.push({
      headline: `${topSource.split(" (")[0]} is your top referral source`,
      detail: `${topSource.split(" (")[0]} leads your referral network with ${topSource.match(/\((\d+)/)?.[1] || "multiple"} referrals. This relationship is worth $${cv * parseInt(topSource.match(/\((\d+)/)?.[1] || "3", 10)} in annual revenue. A thank-you card or lunch visit reinforces the relationship and keeps you top of mind when they have a patient to refer. Schedule a visit or send a note this week.`,
      humanNeed: "belonging",
      economicConsequence: {
        thirtyDay: `$${cv * 2} from this source this month`,
        ninetyDay: `$${cv * 6} if the relationship strengthens`,
        yearDay: `$${cv * parseInt(topSource.match(/\((\d+)/)?.[1] || "3", 10)} directly attributable to this source`,
      },
    });
  } else {
    findings.push({
      headline: `Your referral network needs visibility`,
      detail: `Upload your PMS referral data to see exactly which offices are sending patients and which have gone quiet. Practices that track referral sources by name catch drift 60 days faster than those who track by volume alone. The difference is the ability to call a specific office before the relationship goes cold.`,
      humanNeed: "belonging",
      economicConsequence: {
        thirtyDay: `$${cv * 2} if one referral source drifts unnoticed`,
        ninetyDay: `$${cv * 8} if drift becomes permanent`,
        yearDay: `$${cv * 24} annual from one lost referral relationship`,
      },
    });
  }

  // Finding 3: Cold referral source (named) or general review velocity
  if (context.coldReferralSources.length > 0) {
    const coldSource = context.coldReferralSources[0];
    findings.push({
      headline: `${coldSource} sent only 1 referral recently and may be going quiet`,
      detail: `${coldSource} appears in your referral data with only 1 recent referral. When a previously active source drops to 1, it often means they found another provider or their patient volume shifted. The window to re-engage is typically 30 days. Have your front desk call ${coldSource}'s office this week to check in and reaffirm the relationship.`,
      humanNeed: "belonging",
      economicConsequence: {
        thirtyDay: `$${cv} at risk if this source goes silent`,
        ninetyDay: `$${cv * 4} if the relationship is lost`,
        yearDay: `$${cv * 12} annual from a lost referral partner`,
      },
    });
  } else {
    findings.push({
      headline: `Your review velocity is a growth lever`,
      detail: `Consistent review growth signals trust to both patients and search algorithms. Practices that add 3+ reviews per week rank higher and convert more new patients than those with sporadic reviews. Set a team goal of asking every patient at checkout. The compound effect over 90 days is significant.`,
      humanNeed: "purpose",
      economicConsequence: {
        thirtyDay: `Improved visibility from consistent review growth`,
        ninetyDay: `Sustained review momentum compounds over time`,
        yearDay: `Review velocity becomes a durable competitive advantage`,
      },
    });
  }

  return findings;
}
