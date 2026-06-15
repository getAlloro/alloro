export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Back button skeleton */}
      <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>

      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
        <div className="flex gap-3">
          <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="h-10 w-28 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
      </div>

      {/* Main content card skeleton */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-64 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
        {/* Right panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-64 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}
