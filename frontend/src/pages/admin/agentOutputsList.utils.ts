export const formatDateRange = (dateString: string) => {
  const date = new Date(dateString);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

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
  return formatDateRange(dateString);
};

export const formatAgentType = (agentType: string): string => {
  return agentType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const getStatusStyles = (status: string): string => {
  switch (status) {
    case "success":
      return "border-green-200 bg-green-100 text-green-700";
    case "pending":
      return "border-yellow-200 bg-yellow-100 text-yellow-700";
    case "error":
      return "border-red-200 bg-red-100 text-red-700";
    case "archived":
      return "border-gray-200 bg-gray-100 text-gray-500";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700";
  }
};
