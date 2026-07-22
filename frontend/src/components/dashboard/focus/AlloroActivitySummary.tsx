import { useProofReceipt } from "../../../hooks/queries/useProofReceipt";

/**
 * AlloroActivitySummary — the "here's what Alloro did for you" line shown in the
 * OneThingBanner's calm state (no urgent action). Replaces a bare "all caught up"
 * (which reads as "nothing is happening") with the real, dated work Alloro has
 * done: review replies posted, local posts published.
 *
 * Honest by construction (NS1 + Value #6): counts come straight from the
 * proof-receipt (published work items). When there is genuinely nothing yet, it
 * says so plainly — it never manufactures activity.
 */

interface AlloroActivitySummaryProps {
  orgId: number | null;
  locationId: number | null;
}

export function AlloroActivitySummary({ orgId, locationId }: AlloroActivitySummaryProps) {
  const { receipt, isLoading } = useProofReceipt(orgId, locationId);

  if (isLoading) {
    return (
      <>
        <h3 className="font-display text-xl text-alloro-navy">Alloro's on it.</h3>
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-accent-soft-line" />
      </>
    );
  }

  const summary = receipt?.summary;
  const parts: string[] = [];
  if (summary && summary.reviewReplies > 0) {
    parts.push(
      `${summary.reviewReplies} review ${summary.reviewReplies === 1 ? "reply" : "replies"}`,
    );
  }
  if (summary && summary.localPosts > 0) {
    parts.push(`${summary.localPosts} ${summary.localPosts === 1 ? "post" : "posts"}`);
  }

  return (
    <>
      <h3 className="font-display text-xl text-alloro-navy">Alloro's on it.</h3>
      <p className="mt-1 text-[13.5px] text-ink-muted">
        {parts.length > 0
          ? `Recently, Alloro handled ${parts.join(" and ")} for you — done, no action needed.`
          : "No fires to put out right now. Alloro's watching your listings and will act the moment something needs it."}
      </p>
    </>
  );
}

export default AlloroActivitySummary;
