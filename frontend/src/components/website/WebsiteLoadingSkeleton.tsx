/**
 * Shared loading skeleton for the Websites tab. Matches the cards-first overview
 * by default (the common landing), or the editor layout when `editor` is set.
 *
 * Used by both DFYRoute (during the tier check) and DFYWebsite (during the data
 * fetch) so the user sees one consistent overview-shaped skeleton instead of a
 * stale editor-shaped one flashing first. Sidebar-less — the app shell renders
 * the real sidebar around this.
 */
export function WebsiteLoadingSkeleton({ editor = false }: { editor?: boolean }) {
  return (
    <div className="flex flex-col h-screen bg-alloro-bg animate-pulse">
      <div className="bg-white border-b border-black/5 px-4 py-3 flex items-center gap-4">
        <div className="h-6 w-32 bg-slate-200 rounded" />
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 w-20 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
      {editor ? (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 p-6">
            <div className="h-full bg-slate-100 rounded-2xl" />
          </div>
          <div className="w-96 bg-white border-l border-black/5 p-4 space-y-4">
            <div className="h-6 w-24 bg-slate-200 rounded" />
            <div className="h-4 w-48 bg-slate-100 rounded" />
            <div className="mt-8 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-4 bg-slate-100 rounded"
                  style={{ width: `${80 - i * 15}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <div className="space-y-2">
              <div className="h-7 w-64 bg-slate-200 rounded" />
              <div className="h-4 w-80 bg-slate-100 rounded" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <div className="h-72 rounded-[14px] border border-black/5 bg-white xl:col-span-2" />
              <div className="h-72 rounded-[14px] border border-black/5 bg-white" />
              <div className="h-40 rounded-[14px] border border-black/5 bg-white" />
              <div className="h-40 rounded-[14px] border border-black/5 bg-white" />
              <div className="h-40 rounded-[14px] border border-black/5 bg-white" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
