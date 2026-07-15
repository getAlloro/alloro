import { apiGet, unwrap } from "./index";
import type {
  LatestAgentOutputsResponse,
  LatestSummaryAgentOutput,
} from "../types/agentSummary";

export async function fetchLatestSummaryOutput(
  organizationId: number,
  locationId: number | null,
): Promise<LatestSummaryAgentOutput | null> {
  const query = new URLSearchParams();
  if (locationId !== null) query.set("locationId", String(locationId));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = unwrap<LatestAgentOutputsResponse>(
    await apiGet({ path: `/agents/latest/${organizationId}${suffix}` }),
  );
  return response.agents.summary;
}
