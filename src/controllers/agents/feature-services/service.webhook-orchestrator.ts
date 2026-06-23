/**
 * Webhook Orchestrator Service
 *
 * Centralized agent webhook calls. All external webhook communication
 * goes through this service. Includes the generic callAgentWebhook
 * function, the identifyLocationMeta function, and webhook URL constants.
 */

import axios from "axios";
import { log } from "../feature-utils/agentLogger";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { substitutePromptPlaceholders } from "../../../agents/service.prompt-substituter";
import { OrgType } from "../../../config/orgLabels";
import { runAgent } from "../../../agents/service.llm-runner";
import {
  getExternalErrorMessage,
  isRetryableExternalError,
  runWithRetry,
} from "../../practice-ranking/feature-services/service.ranking-resilience";

// =====================================================================
// WEBHOOK URL CONSTANTS
// =====================================================================

export const PROOFLINE_WEBHOOK = process.env.PROOFLINE_AGENT_WEBHOOK || "";
export const SUMMARY_WEBHOOK = process.env.SUMMARY_AGENT_WEBHOOK || "";
export const REFERRAL_ENGINE_WEBHOOK =
  process.env.REFERRAL_ENGINE_AGENT_WEBHOOK || "";
export const OPPORTUNITY_WEBHOOK = process.env.OPPORTUNITY_AGENT_WEBHOOK || "";
export const CRO_OPTIMIZER_WEBHOOK =
  process.env.CRO_OPTIMIZER_AGENT_WEBHOOK || "";
export const COPY_COMPANION_WEBHOOK =
  process.env.COPY_COMPANION_AGENT_WEBHOOK || "";
export const GUARDIAN_AGENT_WEBHOOK =
  process.env.GUARDIAN_AGENT_WEBHOOK || "";
export const GOVERNANCE_AGENT_WEBHOOK =
  process.env.GOVERNANCE_AGENT_WEBHOOK || "";
export const IDENTIFIER_AGENT_WEBHOOK =
  process.env.IDENTIFIER_AGENT_WEBHOOK || "";

// =====================================================================
// GENERIC WEBHOOK CALLER
// =====================================================================

/**
 * Call an agent webhook with payload
 */
export async function callAgentWebhook(
  webhookUrl: string,
  payload: any,
  agentName: string,
): Promise<any> {
  if (!webhookUrl) {
    throw new Error(`No webhook URL configured for ${agentName}`);
  }

  log(`  \u2192 Calling ${agentName} webhook: ${webhookUrl}`);

  try {
    const response = await axios.post(webhookUrl, payload, {
      timeout: 600000, // 10 minutes timeout
      headers: {
        "Content-Type": "application/json",
      },
    });

    log(`  \u2713 ${agentName} webhook responded successfully`);
    return response.data;
  } catch (error: any) {
    log(`  \u2717 ${agentName} webhook failed: ${error?.message || String(error)}`);
    throw error;
  }
}

// =====================================================================
// IDENTIFIER AGENT
// =====================================================================

/**
 * Call Identifier Agent to determine specialty and market location from GBP profile
 */
export async function identifyLocationMeta(
  gbpData: any,
  domain: string,
  orgType: OrgType = "health",
): Promise<{ specialty: string; marketLocation: string }> {
  log(`  [IDENTIFIER] Identifying specialty and market for ${domain}`);

  // NOTE: The Identifier prompt also returns specialtyKeywords[], city, state,
  // county, postalCode. Path A migration: SDK currently returns parity-only
  // {specialty, marketLocation}. Wire up the additional fields in a follow-up
  // when competitor discovery / geo filtering needs them.
  try {
    const payload = {
      domain,
      gbp_profile: gbpData.profile || {},
      storefront_address: gbpData.profile?.storefrontAddress || {},
      address: {
        locality: gbpData.profile?.storefrontAddress?.locality || "",
        administrativeArea:
          gbpData.profile?.storefrontAddress?.administrativeArea || "",
        postalCode: gbpData.profile?.storefrontAddress?.postalCode || "",
        addressLines: gbpData.profile?.storefrontAddress?.addressLines || [],
      },
    };

    const systemPrompt = substitutePromptPlaceholders(
      loadPrompt("rankingAgents/Identifier"),
      orgType,
    );
    const userMessage = JSON.stringify(payload, null, 2);

    const { value: result, attempts } = await runWithRetry(
      async () => {
        const agentResult = await runAgent({
          systemPrompt,
          userMessage,
          maxTokens: 1024,
        });

        if (!agentResult.parsed || typeof agentResult.parsed !== "object") {
          throw new Error("Identifier returned non-parseable response");
        }

        return agentResult;
      },
      {
        label: `Identifier Agent (${domain})`,
        maxAttempts: 3,
        logger: log,
        shouldRetry: (error) =>
          isRetryableExternalError(error) ||
          getExternalErrorMessage(error)
            .toLowerCase()
            .includes("non-parseable"),
      },
    );

    const data = result.parsed;
    const fallback = getFallbackMeta(gbpData);
    const specialty = data.specialty || fallback.specialty;
    const marketLocation = data.marketLocation || getFallbackMarket(gbpData);

    log(
      `  [IDENTIFIER] \u2713 Identified: ${specialty} in ${marketLocation} (${result.inputTokens} in / ${result.outputTokens} out, attempts=${attempts.length})`,
    );

    return { specialty, marketLocation };
  } catch (error: any) {
    log(
      `  [IDENTIFIER] \u2717 SDK call failed: ${error.message}. Using fallbacks.`,
    );
    return getFallbackMeta(gbpData);
  }
}

/**
 * Fallback logic for location metadata
 */
export function getFallbackMeta(gbpData: any): {
  specialty: string;
  marketLocation: string;
} {
  return {
    specialty: getFallbackSpecialty(gbpData),
    marketLocation: getFallbackMarket(gbpData),
  };
}

function getFallbackSpecialty(gbpData: any): string {
  const profile = gbpData?.profile || {};
  const categoryValues = [
    profile.primaryCategory?.displayName,
    profile.primaryCategory?.name,
    profile.primaryCategory,
    ...(Array.isArray(profile.additionalCategories)
      ? profile.additionalCategories.map(
          (category: any) => category?.displayName || category?.name || category,
        )
      : []),
    profile.title,
    profile.businessName,
    profile.name,
  ];
  const haystack = categoryValues
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (haystack.includes("endodont")) return "endodontist";
  if (haystack.includes("orthodont")) return "orthodontist";
  if (haystack.includes("periodont")) return "periodontist";
  if (haystack.includes("oral surgeon") || haystack.includes("oral surgery")) {
    return "oral surgeon";
  }
  if (haystack.includes("pediatric")) return "pediatric dentist";
  if (haystack.includes("prosthodont")) return "prosthodontist";

  return "dentist";
}

/**
 * Extract city, state from GBP profile storefront address
 */
export function getFallbackMarket(gbpData: any): string {
  const addr = gbpData.profile?.storefrontAddress;
  if (addr && addr.locality && addr.administrativeArea) {
    return `${addr.locality}, ${addr.administrativeArea}`;
  }
  return "Unknown, US";
}
