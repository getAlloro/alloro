import type { AgentType } from "../../types/tasks";
import { useLabels } from "../../hooks/useLabels";

interface AgentTypePillProps {
  agentType: AgentType | null | undefined;
}

export function AgentTypePill({ agentType }: AgentTypePillProps) {
  const labels = useLabels();

  if (!agentType) {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600">
        Manual
      </span>
    );
  }

  const getAgentTypeStyles = (type: AgentType) => {
    switch (type) {
      case "GBP_OPTIMIZATION":
        return {
          label: "GBP Copy",
          className: "border-purple-200 bg-purple-50 text-purple-700",
        };
      case "OPPORTUNITY":
        return {
          label: "Opportunity",
          className: "border-blue-200 bg-blue-50 text-blue-700",
        };
      case "CRO_OPTIMIZER":
        return {
          label: "CRO",
          className: "border-green-200 bg-green-50 text-green-700",
        };
      case "REFERRAL_ENGINE_ANALYSIS":
        return {
          label: labels.engine,
          className: "border-orange-200 bg-orange-50 text-orange-700",
        };
      case "RANKING":
        return {
          label: labels.practiceRanking,
          className: "border-indigo-200 bg-indigo-50 text-indigo-700",
        };
      case "MANUAL":
        return {
          label: "Manual",
          className: "border-gray-200 bg-gray-50 text-gray-600",
        };
      default:
        return {
          label: "Unknown",
          className: "border-gray-200 bg-gray-50 text-gray-600",
        };
    }
  };

  const { label, className } = getAgentTypeStyles(agentType);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
