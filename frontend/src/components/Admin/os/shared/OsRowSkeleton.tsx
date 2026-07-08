/**
 * Row-shaped loading skeleton (D13 — never a centered spinner). Height
 * matches the hairline document rows so the list doesn't jump on load.
 */
export function OsRowSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-t border-line-soft px-2 py-4"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gray-200 motion-safe:animate-pulse" />
          <span
            className="h-4 rounded bg-gray-200/80 motion-safe:animate-pulse"
            style={{ width: `${34 + ((i * 13) % 32)}%` }}
          />
          <span className="ml-auto h-3 w-16 rounded bg-gray-200/60 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
