/**
 * Behavioral Event Intelligence Layer -- WO-BEHAVIORAL-INTELLIGENCE
 *
 * Mines behavioral_events for patterns instead of just logging.
 * Two functions:
 *   getEngagementScore  -- weighted 0-100 score from last 30 days
 *   getMostSignificantEvent -- single most important event from last 7 days
 *
 * // Engagement score feeds account health agent, Monday email
 * // personalization, and CS expander criteria
 */

import { db } from "../database/connection";
import logger from "../lib/logger";

// ─── Event Weights ───

const EVENT_WEIGHTS: Record<string, { weight: number; max?: number; oneTime?: boolean }> = {
  "dashboard.viewed":              { weight: 1, max: 20 },
  "one_action_card.clicked":       { weight: 3 },
  "referral_intelligence.viewed":  { weight: 4 },
  "review_request.sent":           { weight: 5 },
  "ttfv.yes":                      { weight: 10, oneTime: true },
  "first_win.achieved":            { weight: 15, oneTime: true },
  "billing.subscription_created":  { weight: 20, oneTime: true },
};

const MAX_RAW_SCORE = 80;

// ─── Event Priority (for most significant) ───

const EVENT_PRIORITY: string[] = [
  "first_win.achieved",
  "billing.subscription_created",
  "billing.subscription_cancelled",
  "billing.payment_failed",
  "review_request.sent",
  "referral_intelligence.viewed",
  "one_action_card.clicked",
  "dashboard.viewed",
];

// ─── Debounce: max once per hour per org ───

const lastComputeTime = new Map<number, number>();

function shouldDebounce(orgId: number): boolean {
  const last = lastComputeTime.get(orgId);
  if (!last) return false;
  return Date.now() - last < 60 * 60 * 1000; // 1 hour
}

// ─── Engagement Score ───

/**
 * Compute a 0-100 engagement score from the last 30 days of behavioral events.
 * Persists to organizations.engagement_score.
 */
export async function getEngagementScore(orgId: number): Promise<number> {
  if (shouldDebounce(orgId)) {
    // Return cached value
    const org = await db("organizations")
      .where({ id: orgId })
      .select("engagement_score")
      .first();
    return org?.engagement_score ?? 0;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const events = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("created_at", ">=", thirtyDaysAgo)
    .select("event_type")
    .orderBy("created_at", "desc");

  let rawScore = 0;
  const eventCounts: Record<string, number> = {};

  for (const event of events) {
    const config = EVENT_WEIGHTS[event.event_type];
    if (!config) continue;

    const count = (eventCounts[event.event_type] || 0) + 1;
    eventCounts[event.event_type] = count;

    // One-time events only count once
    if (config.oneTime && count > 1) continue;

    // Capped events respect max
    if (config.max && count > config.max) continue;

    rawScore += config.weight;
  }

  // Normalize to 0-100
  const normalized = Math.min(100, Math.round((rawScore / MAX_RAW_SCORE) * 100));

  // Persist
  await db("organizations")
    .where({ id: orgId })
    .update({
      engagement_score: normalized,
      engagement_score_updated_at: new Date(),
    });

  lastComputeTime.set(orgId, Date.now());

  return normalized;
}

// ─── Most Significant Event ───

/**
 * Return the single most significant behavioral event from the last 7 days.
 * Priority order defined in EVENT_PRIORITY.
 * Used by: Purpose Agent weekly impact signal, Founder Mode Panel 1.
 */
export async function getMostSignificantEvent(orgId: number): Promise<string | null> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const events = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("created_at", ">=", sevenDaysAgo)
    .select("event_type")
    .orderBy("created_at", "desc");

  if (events.length === 0) return null;

  const eventTypes = new Set(events.map((e: any) => e.event_type));

  // Return highest priority event that exists in the last 7 days
  for (const priorityEvent of EVENT_PRIORITY) {
    if (eventTypes.has(priorityEvent)) return priorityEvent;
  }

  // Fallback: most recent event type
  return events[0].event_type;
}

/**
 * Fire-and-forget engagement score update. Call after any behavioral event is logged.
 * Respects 1-hour debounce per org.
 */
export function updateEngagementScoreAsync(orgId: number | null): void {
  if (!orgId) return;
  getEngagementScore(orgId).catch((err) => {
    logger.error({ err: err.message }, `[BehavioralIntel] Score update failed for org ${orgId}:`);
  });
}

// ─── Agent Signal Bus ────────────────────────────────────────────────
// Structured findings that agents write for other agents to consume.
// Uses existing behavioral_events table with event_type "agent.finding".
// No new table needed.

export interface AgentFinding {
  agentName: string;
  findingType: string;
  priority: number;       // 1 (low) to 10 (critical). 8+ means "requires human action within 24h"
  shareability: number;   // 1 (internal only) to 10 (study club bomb). A finding is shareable if it names a person, includes a dollar figure, and would make a stranger stop.
  headline: string;       // Human-readable, email-ready, phone-showable
  detail: string;
  orgId: number;
  dollarImpact?: number;
  competitorName?: string;
  actionUrl?: string;
}

/**
 * Record a structured finding from any agent.
 * Downstream consumers: Monday email, morning briefing, one-action card.
 */
export async function recordAgentFinding(finding: AgentFinding): Promise<void> {
  await db("behavioral_events").insert({
    id: db.raw("gen_random_uuid()"),
    event_type: "agent.finding",
    org_id: finding.orgId,
    properties: JSON.stringify({
      agent_name: finding.agentName,
      finding_type: finding.findingType,
      priority: finding.priority,
      headline: finding.headline,
      detail: finding.detail,
      shareability: finding.shareability ?? 1,
      dollar_impact: finding.dollarImpact ?? null,
      competitor_name: finding.competitorName ?? null,
      action_url: finding.actionUrl ?? null,
    }),
    created_at: new Date(),
  });
}

/**
 * Get the highest-priority agent finding for an org within a time window.
 */
export async function getTopAgentFinding(
  orgId: number,
  daysBack: number = 7
): Promise<AgentFinding | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const rows = await db("behavioral_events")
    .where({ event_type: "agent.finding", org_id: orgId })
    .where("created_at", ">=", cutoff)
    .orderBy("created_at", "desc")
    .limit(20)
    .select("properties");

  if (rows.length === 0) return null;

  let best: { props: any; priority: number } | null = null;
  for (const row of rows) {
    const props = typeof row.properties === "string" ? JSON.parse(row.properties) : row.properties || {};
    const priority = props.priority ?? 0;
    if (!best || priority > best.priority) {
      best = { props, priority };
    }
  }

  if (!best) return null;
  return {
    agentName: best.props.agent_name,
    findingType: best.props.finding_type,
    priority: best.priority,
    shareability: best.props.shareability ?? 1,
    headline: best.props.headline,
    detail: best.props.detail,
    orgId,
    dollarImpact: best.props.dollar_impact,
    competitorName: best.props.competitor_name,
    actionUrl: best.props.action_url,
  };
}

/**
 * Get the most shareable finding for the Monday email.
 * Optimizes for "study club bomb" potential: findings that get phone-shown.
 * A finding is shareable if it names a person, includes a dollar figure, and would make a stranger stop.
 */
export async function getMostShareableFinding(
  orgId: number,
  daysBack: number = 7
): Promise<AgentFinding | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const rows = await db("behavioral_events")
    .where({ event_type: "agent.finding", org_id: orgId })
    .where("created_at", ">=", cutoff)
    .orderBy("created_at", "desc")
    .limit(20)
    .select("properties");

  if (rows.length === 0) return null;

  let best: { props: any; score: number } | null = null;
  for (const row of rows) {
    const props = typeof row.properties === "string" ? JSON.parse(row.properties) : row.properties || {};
    // Composite: shareability weighted 2x, priority 1x
    const score = (props.shareability ?? 1) * 2 + (props.priority ?? 0);
    if (!best || score > best.score) {
      best = { props, score };
    }
  }

  if (!best) return null;
  return {
    agentName: best.props.agent_name,
    findingType: best.props.finding_type,
    priority: best.props.priority ?? 0,
    shareability: best.props.shareability ?? 1,
    headline: best.props.headline,
    detail: best.props.detail,
    orgId,
    dollarImpact: best.props.dollar_impact,
    competitorName: best.props.competitor_name,
    actionUrl: best.props.action_url,
  };
}

/**
 * Get ALL agent findings across orgs within a time window, sorted by priority desc.
 * Used by morning briefing to synthesize all overnight signals.
 */
export async function getAgentFindings(
  orgId: number | null,
  daysBack: number = 1
): Promise<AgentFinding[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const query = db("behavioral_events")
    .where({ event_type: "agent.finding" })
    .where("created_at", ">=", cutoff)
    .orderBy("created_at", "desc")
    .limit(50);

  if (orgId) query.andWhere({ org_id: orgId });

  const rows = await query.select("properties", "org_id");

  return rows
    .map((row: any) => {
      const props = typeof row.properties === "string" ? JSON.parse(row.properties) : row.properties || {};
      return {
        agentName: props.agent_name,
        findingType: props.finding_type,
        priority: props.priority ?? 0,
        shareability: props.shareability ?? 1,
        headline: props.headline,
        detail: props.detail,
        orgId: row.org_id,
        dollarImpact: props.dollar_impact,
        competitorName: props.competitor_name,
        actionUrl: props.action_url,
      } as AgentFinding;
    })
    .sort((a, b) => b.priority - a.priority);
}
