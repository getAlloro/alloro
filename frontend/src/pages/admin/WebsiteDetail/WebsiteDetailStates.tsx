import { Link } from "react-router-dom";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { ActionButton } from "../../../components/ui/DesignSystem";

/**
 * Early-return state views for WebsiteDetail (loading skeleton, error, not-found).
 * Moved verbatim from WebsiteDetail — same JSX, classNames, text, and props.
 */

export function WebsiteDetailLoading() {
  // Show skeleton loading state with grey cards
  return (
    <div className="space-y-6">
      {/* Back button skeleton */}
      <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>

      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 w-48 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
      </div>

      {/* Main content card skeleton */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="h-6 w-40 bg-gray-200 rounded animate-pulse"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
        </div>
      </div>

      {/* Additional card skeleton */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}

export function WebsiteDetailError({
  embedded,
  backPath,
  backLabel,
  error,
  loadWebsite,
}: {
  embedded: boolean;
  backPath: string;
  backLabel: string;
  error: string;
  loadWebsite: () => void;
}) {
  return (
    <div className="space-y-6">
      {!embedded && (
        <Link
          to={backPath}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-900">
            Error loading website
          </p>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
        <ActionButton
          label="Retry"
          onClick={loadWebsite}
          variant="danger"
          size="sm"
        />
      </div>
    </div>
  );
}

export function WebsiteDetailNotFound({
  embedded,
  backPath,
  backLabel,
}: {
  embedded: boolean;
  backPath: string;
  backLabel: string;
}) {
  return (
    <div className="space-y-6">
      {!embedded && (
        <Link
          to={backPath}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="text-center py-16 text-gray-500">Website not found</div>
    </div>
  );
}
