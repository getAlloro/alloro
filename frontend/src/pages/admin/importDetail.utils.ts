export const TYPE_COLORS: Record<string, string> = {
  css: "bg-blue-100 text-blue-700",
  javascript: "bg-yellow-100 text-yellow-700",
  image: "bg-purple-100 text-purple-700",
  font: "bg-pink-100 text-pink-700",
  file: "bg-gray-100 text-gray-700",
};

export const STATUS_COLORS: Record<string, string> = {
  published: "border-green-200 bg-green-100 text-green-700",
  active: "border-blue-200 bg-blue-100 text-blue-700",
  deprecated: "border-red-200 bg-red-100 text-red-700",
};

export const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  active: "Active",
  deprecated: "Deprecated",
};

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function editorLanguage(type: string): string {
  if (type === "css") return "css";
  if (type === "javascript") return "javascript";
  return "plaintext";
}
