import type { GbpReadiness } from "../../../api/gbpAutomation";

export function formatGbpStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function nextPostLabel(value: string | null | undefined): string {
  if (!value) return "Not scheduled";
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "Due now";
  const days = Math.ceil(diff / 86400000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function areGbpReplyPrerequisitesReady(readiness: GbpReadiness): boolean {
  return Object.entries(readiness.checks)
    .filter(
      ([key]) =>
        key !== "featureEnabled" &&
        key !== "reviewRepliesEnabled" &&
        key !== "postDraftsEnabled"
    )
    .every(([, value]) => Boolean(value));
}

export function diagnosticsGateMessage(
  diagnosticsConfirmed: boolean,
  prerequisitesReady: boolean,
  isReviewReplyEnabled: boolean
): string {
  if (isReviewReplyEnabled && diagnosticsConfirmed && prerequisitesReady) {
    return "Review replies are enabled. New replyable reviews will appear in Reviews.";
  }
  if (!diagnosticsConfirmed) return "Rerun diagnostics before enabling review replies.";
  if (!prerequisitesReady) return "Resolve diagnostics before enabling review replies.";
  return "Diagnostics passed. Review replies can be enabled.";
}
