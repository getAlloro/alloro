import type {
  WebsiteProject,
  FetchWebsitesRequest,
  WebsiteProjectListView,
} from "../../api/websites";

export const INITIAL_PROJECT_LIST_VIEW: WebsiteProjectListView = "active";

export function buildWebsiteFilters(
  projectListView: WebsiteProjectListView,
  selectedStatus: string,
): FetchWebsitesRequest {
  const nextFilters: FetchWebsitesRequest = {
    page: 1,
    limit: 50,
    projectListView,
  };

  if (selectedStatus !== "all") {
    nextFilters.status = selectedStatus;
  }

  return nextFilters;
}

export const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

export const getStatusStyles = (status: string): string => {
  switch (status) {
    case "LIVE":
      return "border-green-200 bg-green-100 text-green-700";
    case "IN_PROGRESS":
      return "border-yellow-200 bg-yellow-100 text-yellow-700";
    case "CREATED":
      return "border-gray-200 bg-gray-100 text-gray-700";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700";
  }
};

// Get icon background color based on status - subtle backgrounds with glow
export const getIconStyles = (status: string): string => {
  switch (status) {
    case "LIVE":
      return "bg-green-100 shadow-[0_0_12px_rgba(34,197,94,0.4)]";
    case "CREATED":
      return "bg-gray-100";
    default:
      return "bg-orange-100 shadow-[0_0_12px_rgba(214,104,83,0.4)]";
  }
};

// Get icon color based on status
export const getIconColor = (status: string): string => {
  switch (status) {
    case "LIVE":
      return "text-green-600";
    case "CREATED":
      return "text-gray-400";
    default:
      return "text-alloro-orange";
  }
};

// Check if status is a processing state (should show spinner)
export const isProcessingStatus = (status: string): boolean => {
  return !["LIVE", "CREATED"].includes(status);
};

export const formatStatus = (status: string): string => {
  return status
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

// Extract business name — prefer project_identity.business.name, fall back to legacy step_gbp_scrape
export const getBusinessName = (website: WebsiteProject): string | null => {
  const identity = website.project_identity as Record<string, unknown> | null | undefined;
  const businessObj = identity && typeof identity === "object"
    ? (identity as { business?: Record<string, unknown> }).business
    : null;
  const fromIdentity = businessObj && typeof businessObj === "object"
    ? (businessObj.name as string | undefined)
    : undefined;
  if (fromIdentity) return fromIdentity;

  if (website.step_gbp_scrape && typeof website.step_gbp_scrape === "object") {
    const gbpData = website.step_gbp_scrape as Record<string, unknown>;
    if (gbpData.name && typeof gbpData.name === "string") return gbpData.name;
    if (gbpData.title && typeof gbpData.title === "string") return gbpData.title as string;
  }
  return null;
};
