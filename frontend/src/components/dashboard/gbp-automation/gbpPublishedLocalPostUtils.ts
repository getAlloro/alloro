import type { GbpPublishedLocalPost } from "../../../api/gbpAutomation";

const MEDIA_URL_FIELDS = ["sourceUrl", "googleUrl", "thumbnailUrl"] as const;

export function imageUrlFromMedia(media: Array<Record<string, unknown>>): string {
  for (const item of media) {
    for (const field of MEDIA_URL_FIELDS) {
      const value = item[field];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return "";
}

export function dateLabel(value: string | null): string {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function postStatePill(post: GbpPublishedLocalPost): {
  label: string;
  className: string;
} {
  const state = post.state.toUpperCase();
  if (state === "REJECTED") {
    return {
      label: "Rejected by Google",
      className: "bg-red-50 text-red-700",
    };
  }

  if (state === "PROCESSING" && !post.searchUrl) {
    return {
      label: "Google processing",
      className: "bg-amber-50 text-amber-700",
    };
  }

  if (state === "LIVE" || post.searchUrl) {
    return {
      label: "Live on Google",
      className: "bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: post.state.replaceAll("_", " ").toLowerCase(),
    className: "bg-slate-100 text-slate-600",
  };
}

export function postStateHelp(post: GbpPublishedLocalPost): string {
  const state = post.state.toUpperCase();
  if (state === "REJECTED") {
    return "Google rejected this post. Adjust the text or image, then save to Google again.";
  }
  if (state === "PROCESSING" && !post.searchUrl) {
    return "Google is still processing this post. Edits here stay staged until you save to Google.";
  }
  return "This is synced from Google. Text and image edits stay staged here until you save to Google.";
}
