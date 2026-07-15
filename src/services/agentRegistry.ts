/**
 * Agent Registry
 *
 * Code-defined map of agent_key → handler.
 * The scheduler worker looks up handlers here.
 * The admin API exposes available keys for the "create schedule" dropdown.
 */

import { executeProoflineAgent } from "../controllers/agents/feature-services/service.proofline-executor";
import { executeRankingAgent } from "../controllers/agents/feature-services/service.ranking-executor";
import { executeNapConsistencyAgent } from "./nap-consistency/executor";

export interface AgentHandler {
  displayName: string;
  description: string;
  handler: () => Promise<{ summary: Record<string, unknown> }>;
}

const registry: Record<string, AgentHandler> = {
  proofline: {
    displayName: "Proofline Agent",
    description: "Daily proofline analysis — generates Win/Risk data points from GBP and website analytics for all onboarded locations.",
    handler: async () => {
      const result = await executeProoflineAgent();
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
  },
  ranking: {
    displayName: "Practice Ranking",
    description: "Competitive ranking analysis — discovers competitors, scores, and generates LLM analysis for all onboarded locations.",
    handler: async () => {
      const result = await executeRankingAgent();
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
  },
  nap_consistency: {
    displayName: "Citations & NAP Consistency Monitor",
    description:
      "Recurring NAP-consistency check across external listings for all onboarded locations — observe + flag conflicts to fix, never a rank promise. Seeded DISABLED; enable to set live (incurs SerpApi cost).",
    handler: async () => {
      const result = await executeNapConsistencyAgent();
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
  },
};

export function getAgentHandler(agentKey: string): AgentHandler | undefined {
  return registry[agentKey];
}

export function getRegisteredAgents(): Array<{ key: string; displayName: string; description: string }> {
  return Object.entries(registry).map(([key, { displayName, description }]) => ({
    key,
    displayName,
    description,
  }));
}
