import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, Check, Loader2, Tag } from "lucide-react";
import { ApiError } from "../../../api";
import type {
  GbpCategoryProposalResult,
  GbpCategoryRecommendation,
} from "../../../api/gbpAutomation";
import { useGbpCategoryProposalActions } from "../../../hooks/queries/useGbpAutomationQueries";

export type GbpCategoryProposalPanelProps = {
  organizationId: number | null;
  locationId?: number | null;
};

/** The backend rejects an approval with this code when profile write-back is off. */
const WRITEBACK_DISABLED_CODE = "BUSINESS_INFO_WRITEBACK_DISABLED";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-[9px] bg-alloro-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-[9px] border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function errorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";
}

/** The current → suggested category pair, shown on the proposal and approved cards. */
function CategoryChange({ recommendation }: { recommendation: GbpCategoryRecommendation }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Current</p>
        <p className="text-sm font-bold text-gray-700">
          {recommendation.current.displayName || "Not set"}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Suggested</p>
        <p className="text-sm font-bold text-gray-900">{recommendation.proposed.displayName}</p>
      </div>
    </div>
  );
}

type ProposalCardProps = {
  recommendation: GbpCategoryRecommendation;
  workItemId: string;
  onApprove: (workItemId: string) => void;
  onDismiss: (workItemId: string) => void;
  isApproving: boolean;
  isDismissing: boolean;
  approveError: unknown;
  dismissError: unknown;
};

/**
 * Resolve the message for whichever action failed. Approve has a calm gated case
 * (write-back off); dismiss just gets a plain retry line so the owner is never
 * left wondering whether the click did anything (§16.2 — never swallow).
 */
function actionErrorMessage(approveError: unknown, dismissError: unknown): string | null {
  if (approveError) {
    return errorCode(approveError) === WRITEBACK_DISABLED_CODE
      ? "Sending profile changes to Google is not switched on for this location yet, so this cannot be approved for publishing. Your suggestion stays saved as a draft."
      : errorMessage(approveError);
  }
  if (dismissError) {
    return "We could not dismiss this suggestion right now. Please try again.";
  }
  return null;
}

/** A staged suggestion the owner can approve or decline. Nothing publishes here. */
function ProposalCard({
  recommendation,
  workItemId,
  onApprove,
  onDismiss,
  isApproving,
  isDismissing,
  approveError,
  dismissError,
}: ProposalCardProps) {
  const isBusy = isApproving || isDismissing;
  const errorText = actionErrorMessage(approveError, dismissError);
  return (
    <div>
      <h4 className="text-sm font-bold text-gray-900">A more specific category may fit</h4>
      <CategoryChange recommendation={recommendation} />
      <p className="mt-3 text-xs font-medium leading-5 text-gray-600">
        {recommendation.rationale}
      </p>
      <p className="mt-2 text-xs font-medium leading-5 text-gray-500">
        This is staged for your review. Nothing is sent to Google until you approve it, and
        publishing a profile change stays off until it is switched on for your account.
      </p>
      {errorText ? (
        <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-amber-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{errorText}</span>
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onApprove(workItemId)}
          className={PRIMARY_BUTTON}
        >
          {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Approve this change
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onDismiss(workItemId)}
          className={SECONDARY_BUTTON}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** Shell around every state so the header stays constant while the body swaps. */
function PanelShell({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-alloro-orange" aria-hidden />
        <p className="text-xs font-semibold text-gray-500">Google primary category</p>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * GF2 — the primary-category lever, owner-facing. Lets the owner ask Alloro to
 * review their Google primary category and, when a more specific one fits, review
 * and approve the staged change. It never publishes: approving records the owner's
 * decision, and sending it to Google is a separate step gated server-side.
 */
export function GbpCategoryProposalPanel({
  organizationId,
  locationId,
}: GbpCategoryProposalPanelProps) {
  const { propose, approve, dismiss } = useGbpCategoryProposalActions(
    organizationId,
    locationId
  );
  const result: GbpCategoryProposalResult | undefined = propose.data;

  const runProposal = () => {
    approve.reset();
    dismiss.reset();
    propose.mutate();
  };

  return (
    <PanelShell>
      {approve.isSuccess && result?.proposed ? (
        <ResultNotice
          tone="success"
          title="Change approved"
          body={`Switching your primary category to "${result.recommendation.proposed.displayName}" is saved and ready to publish to your Google profile.`}
          onRetry={runProposal}
          retryLabel="Review again"
          isRetrying={propose.isPending}
        />
      ) : dismiss.isSuccess ? (
        <ResultNotice
          tone="neutral"
          title="Suggestion dismissed"
          body="Your current category is unchanged."
          onRetry={runProposal}
          retryLabel="Review again"
          isRetrying={propose.isPending}
        />
      ) : result?.proposed ? (
        <ProposalCard
          recommendation={result.recommendation}
          workItemId={result.workItem.id}
          onApprove={(id) => approve.mutate(id)}
          onDismiss={(id) => dismiss.mutate(id)}
          isApproving={approve.isPending}
          isDismissing={dismiss.isPending}
          approveError={approve.error}
          dismissError={dismiss.error}
        />
      ) : result && !result.proposed ? (
        <ResultNotice
          tone="neutral"
          title="Your category already fits"
          body="We reviewed your primary category and did not find a more specific one worth suggesting right now."
          onRetry={runProposal}
          retryLabel="Check again"
          isRetrying={propose.isPending}
        />
      ) : errorCode(propose.error) === WRITEBACK_DISABLED_CODE ? (
        <ResultNotice
          tone="neutral"
          title="Category review isn't switched on yet"
          body="Reviewing and updating your Google primary category needs profile updates enabled for your account. That is currently off. Once it is switched on, come back and review your category here."
          onRetry={runProposal}
          retryLabel="Check again"
          isRetrying={propose.isPending}
        />
      ) : propose.isError ? (
        <ResultNotice
          tone="error"
          title="We could not review your category"
          body={errorMessage(propose.error)}
          onRetry={runProposal}
          retryLabel="Try again"
          isRetrying={propose.isPending}
        />
      ) : (
        <IntroCard
          onReview={runProposal}
          isReviewing={propose.isPending}
          disabled={!locationId}
        />
      )}
    </PanelShell>
  );
}

/** First-run explainer + the trigger. Frames the lever honestly (Value #6). */
function IntroCard({
  onReview,
  isReviewing,
  disabled,
}: {
  onReview: () => void;
  isReviewing: boolean;
  disabled: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium leading-5 text-gray-600">
        Your primary category tells Google what your business does. A more specific category
        can help Google match you to the right searches — a change designed to improve how you
        are categorized, not a promise about rankings. Alloro reviews your current category and
        you approve any change before it goes anywhere.
      </p>
      <button
        type="button"
        disabled={disabled || isReviewing}
        onClick={onReview}
        className={`${PRIMARY_BUTTON} mt-4`}
      >
        {isReviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        Review my category
      </button>
      {disabled ? (
        <p className="mt-2 text-xs font-medium text-gray-400">Select a location first.</p>
      ) : null}
    </div>
  );
}

type ResultNoticeProps = {
  tone: "success" | "neutral" | "error";
  title: string;
  body: string;
  onRetry?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
};

/** Terminal-state card: approved, dismissed, no-change, or a failed review. */
function ResultNotice({
  tone,
  title,
  body,
  onRetry,
  retryLabel,
  isRetrying,
}: ResultNoticeProps) {
  const titleColor =
    tone === "success"
      ? "text-emerald-700"
      : tone === "error"
        ? "text-red-700"
        : "text-gray-900";
  return (
    <div>
      <h4 className={`flex items-center gap-2 text-sm font-bold ${titleColor}`}>
        {tone === "success" ? <Check className="h-4 w-4" aria-hidden /> : null}
        {tone === "error" ? <AlertCircle className="h-4 w-4" aria-hidden /> : null}
        {title}
      </h4>
      <p className="mt-2 text-xs font-medium leading-5 text-gray-600">{body}</p>
      {onRetry ? (
        <button
          type="button"
          disabled={isRetrying}
          onClick={onRetry}
          className={`${SECONDARY_BUTTON} mt-4`}
        >
          {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {retryLabel || "Try again"}
        </button>
      ) : null}
    </div>
  );
}
