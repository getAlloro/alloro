/**
 * Shared types for AiCommandTab and its extracted sub-components.
 */

import type {
  AiCommandRecommendation,
  WebsitePage,
} from "../../../api/websites";

export interface AiCommandTabProps {
  projectId: string;
  pages?: WebsitePage[];
  onExecutionComplete?: () => void;
}

export interface PostItem {
  id: string;
  title: string;
  slug: string;
  post_type_slug?: string;
}

export type TargetMode = "all" | "specific" | "off";
export type ViewState = "history" | "input" | "analyzing" | "results" | "executing" | "completed";

export interface RecommendationListProps {
  recommendations: AiCommandRecommendation[];
  expandedGroups: Set<string>;
  toggleGroup: (key: string) => void;
  onApproveReject: (id: string, status: "approved" | "rejected", referenceData?: { reference_url?: string; reference_content?: string }) => void;
  readonly?: boolean;
  loadingRecId: string | null;
}
