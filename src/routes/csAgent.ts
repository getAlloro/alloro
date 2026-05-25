/**
 * CS Agent — Claude-powered account-aware chat for business owners.
 *
 * POST /api/cs-agent/chat
 * Takes the user's message + account context, returns Claude's response.
 * System prompt injected with full business data.
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import rateLimit from "express-rate-limit";
import { db } from "../database/connection";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";
import { prependSubstrate } from "../services/prompt/alloroSubstrate";

const csAgentRoutes = express.Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60, // 60 messages per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many messages. Please try again later." },
});

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Build the system prompt with full account context.
 */
async function buildSystemPrompt(orgId: number, locationId?: number): Promise<string> {
  // Fetch practice data
  const org = await db("organizations")
    .where({ id: orgId })
    .select("name", "domain", "subscription_tier", "referral_code")
    .first();

  const practiceName = org?.name || "your practice";

  // Latest ranking
  let rankingQuery = db("practice_rankings")
    .where({ organization_id: orgId, status: "completed" })
    .orderBy("created_at", "desc")
    .first();
  if (locationId) rankingQuery = rankingQuery.where("location_id", locationId);
  const ranking = await rankingQuery.catch(() => null);

  // Latest agent outputs (proofline)
  const latestOutputs = await db("agent_outputs")
    .where({ organization_id: orgId, status: "success" })
    .orderBy("created_at", "desc")
    .limit(3)
    .select("agent_type", "agent_output", "created_at")
    .catch(() => []);

  // Parse findings from outputs
  const findingSummaries: string[] = [];
  for (const output of latestOutputs) {
    try {
      const data = typeof output.agent_output === "string"
        ? JSON.parse(output.agent_output)
        : output.agent_output;
      const summary = data?.summary || data?.client_summary || data?.one_line_summary;
      if (summary) findingSummaries.push(`[${output.agent_type}] ${summary}`);
    } catch { /* skip unparseable */ }
  }

  // Competitor info from ranking raw_data
  let competitorInfo = "";
  if (ranking) {

    try {
      const rawData = typeof ranking.raw_data === "string"
        ? JSON.parse(ranking.raw_data)
        : ranking.raw_data;
      const competitors = rawData?.competitors || [];
      if (competitors.length > 0) {
        const top3 = competitors.slice(0, 3).map(
          (c: any) => `${c.name} (${c.totalReviews || c.reviewsCount || "?"} reviews, ${c.averageRating || c.totalScore || "?"}★)`
        );
        competitorInfo = `Top competitors: ${top3.join(", ")}.`;
      }
      const clientGbp = rawData?.client_gbp;
      if (clientGbp) {
        // review/rating data used in system prompt readings section below
      }
    } catch { /* skip */ }

    // LLM analysis
    try {
      const llm = typeof ranking.llm_analysis === "string"
        ? JSON.parse(ranking.llm_analysis)
        : ranking.llm_analysis;
      if (llm?.client_summary) {
        findingSummaries.unshift(`[ranking analysis] ${llm.client_summary}`);
      }
    } catch { /* skip */ }
  }

  // Referral source data (top referring GPs)
  let referralInfo = "";
  const hasReferralSourcesTable = await db.schema.hasTable("referral_sources").catch(() => false);
  if (hasReferralSourcesTable) {
    const topReferrers = await db("referral_sources")
      .where({ organization_id: orgId })
      .orderBy("referral_count", "desc")
      .limit(5)
      .select("provider_name", "practice_name", "referral_count")
      .catch(() => []);

    if (topReferrers.length > 0) {
      const lines = topReferrers.map(
        (r: any) => `${r.provider_name}${r.practice_name ? ` (${r.practice_name})` : ""}: ${r.referral_count} referrals`
      );
      referralInfo = `Top referring providers:\n${lines.map((l: string) => `- ${l}`).join("\n")}`;
    }
  }

  const specialty = ranking?.specialty || "business";
  const city = ranking?.search_city || ranking?.location || "";
  const rankPosition = ranking?.rank_position || ranking?.rankPosition || null;
  const totalTracked = ranking?.total_competitors || ranking?.totalCompetitors || null;

  // Fetch checkup data for readings
  const orgFull = await db("organizations").where({ id: orgId }).first();
  let checkupData: any = null;
  if (orgFull?.checkup_data) {
    try {
      checkupData = typeof orgFull.checkup_data === "string"
        ? JSON.parse(orgFull.checkup_data)
        : orgFull.checkup_data;
    } catch { /* skip */ }
  }

  const place = checkupData?.place || {};
  const reviewCount = place.reviewCount || checkupData?.reviewCount || 0;
  const starRating = place.rating || 0;
  const topComp = checkupData?.topCompetitor;

  return `You are the Alloro advisor for ${practiceName}. You are warm, specific, and honest. You speak like a trusted mentor, not a help desk.

RULES FOR ALL RESPONSES:
1. FEEL BEFORE INFORM. First sentence acknowledges what is real about this practice's position. Never open with advice, tasks, or statistics.
2. FACTS ONLY. Only report what exists in the data provided. Stage 1 = competitor rankings and GBP signals only. You cannot see GBP profile completeness, field-level gaps, or completion percentages. Do not fabricate these or any statistics.
3. NO TASKS. Never tell the doctor to do anything. Never use: add, update, connect, fill in, go to, ask patients, or any imperative requiring doctor action. Alloro watches and reports. It does not assign homework.
4. NO FABRICATED AUTHORITY. Do not cite statistics, percentages, or studies unless they appear in the data context provided. If a number does not come from this practice's actual data, do not state it.
5. NO SETTINGS DIRECTIONS. Never direct the doctor to another platform, dashboard, or settings screen.

WHEN ASKED "What should I do this week?":
Sentence 1: Acknowledge current position using only data in context.
Sentence 2: Name one real gap visible in the data.
Sentence 3: Confirm Alloro is watching and will surface changes.
Zero tasks. Zero external statistics. Zero platform directions.

THEIR READINGS (this is ALL the data you have -- do not invent additional data):
- Market Position: ${rankPosition && totalTracked && city ? `#${rankPosition} of ${totalTracked} practices tracked in ${city}` : city ? `Tracked in ${city}` : "Market data loading"}
- Star Rating: ${starRating || "Not yet available"} stars
- Review Volume: ${reviewCount} reviews
- Market: ${totalTracked ? `${totalTracked} practices tracked` : "Building competitive picture"}${competitorInfo ? `. ${competitorInfo}` : ""}
- Specialty: ${specialty}${city ? ` in ${city}` : ""}

${referralInfo || "Referral data: activates when Alloro connects referral sources for this account."}

Recent findings:
${findingSummaries.length > 0 ? findingSummaries.map(f => `- ${f}`).join("\n") : "- Alloro is building your competitive picture. First findings appear after your first weekly scan."}

WHAT ALLORO DOES:
- Reads your Google Business Profile and tracks your market weekly
- Sends a Monday email with one finding and one action
- Builds a website from your reviews and business data
- Drafts responses to your Google reviews
- Tracks your competitive position over time

ADDITIONAL RULES:
- You have the doctor's real market position data. Use it. Never say you cannot tell them their ranking.
- Keep answers to 2-3 short paragraphs. Business owners are busy.
- You are their advisor. Every answer references their specific data.
- If data is unavailable, say so and explain what Alloro is doing to get it. Do not fill the gap with generic advice.`;
}

/**
 * POST /api/cs-agent/chat
 *
 * Body: { message, history: [{role, content}] }
 * Returns: { success, response }
 */
csAgentRoutes.post("/chat", authenticateToken, rbacMiddleware, chatLimiter, async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    if (message.trim().length > 2000) {
      return res.status(400).json({ success: false, error: "Message too long (max 2000 characters)" });
    }

    const locationId = req.body.locationId || null;
    const systemPrompt = prependSubstrate(await buildSystemPrompt(orgId, locationId));

    // Build conversation — last 10 messages max for context window efficiency
    const messages: { role: "user" | "assistant"; content: string }[] = [];
    const recentHistory = (history as any[]).slice(-10);
    for (const h of recentHistory) {
      if (h.role === "user" || h.role === "assistant") {
        messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: "user", content: message.trim() });

    const model = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const assistantMessage =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : "I wasn't able to generate a response. Please try again.";

    return res.json({
      success: true,
      response: assistantMessage,
    });
  } catch (error: any) {
    console.error("[CSAgent] Chat error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Something went wrong. Please try again.",
    });
  }
});

export default csAgentRoutes;
