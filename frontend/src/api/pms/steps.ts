import type { MonthlyAgentKey, StepKey } from "./types";

// =====================================================================
// STEP CONFIGURATION (for UI display)
// =====================================================================

export const STEP_CONFIG: Record<StepKey, { label: string; icon: string }> = {
  file_upload: { label: "File Upload", icon: "📤" },
  pms_parser: { label: "PMS Parser", icon: "🔄" },
  admin_approval: { label: "Admin Approval", icon: "✅" },
  client_approval: { label: "Client Approval", icon: "✅" },
  monthly_agents: { label: "Monthly Agents", icon: "🤖" },
  complete: { label: "Complete", icon: "✓" },
};

// Only the agents that actually run today appear here. Opportunity Agent
// and CRO Optimizer are intentionally omitted — they're disabled in the
// orchestrator (`if (false)` blocks). Keep them in the MonthlyAgentKey
// union type for back-compat with any legacy automation_status_detail
// rows that still list them in agentsCompleted.
export const MONTHLY_AGENT_CONFIG: Partial<Record<MonthlyAgentKey, { label: string }>> =
  {
    data_fetch: { label: "Fetching data" },
    summary_agent: { label: "Summary Agent" },
    referral_engine: { label: "Referral Engine" },
  };
