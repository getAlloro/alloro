import { FileText, ChevronRight } from "lucide-react";

/** Minimal page shape the list needs; assignable from DFYWebsite's Page. */
export type WebsitePageRow = {
  id: string;
  path: string;
  status: string;
  updated_at: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function StatusPill({ status }: { status: string }) {
  const normalized = (status || "").toLowerCase();
  const published = normalized === "published" || normalized === "live";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        published
          ? "bg-[#E8F3EA] text-[#3D8B40]"
          : "bg-[#F0ECE5] text-[color:var(--color-pm-text-secondary)]"
      }`}
    >
      {published ? "Published" : status || "Draft"}
    </span>
  );
}

export type WebsitePagesTabProps = {
  pages: WebsitePageRow[];
  onOpenPage: (pageId: string) => void;
  isLoading?: boolean;
};

export function WebsitePagesTab({
  pages,
  onOpenPage,
  isLoading = false,
}: WebsitePagesTabProps) {
  return (
    <div className="pm-light mx-auto w-full max-w-[960px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div>
        <h2 className="font-display text-[22px] font-medium tracking-tight text-alloro-navy">
          Pages
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-pm-text-secondary)]">
          Every page on your website. Select one to edit it.
        </p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-line-soft bg-white shadow-premium">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-[color:var(--color-pm-text-secondary)]">
            Loading pages…
          </div>
        ) : pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF7F2] text-alloro-orange">
              <FileText size={20} />
            </div>
            <p className="text-[13.5px] font-semibold text-alloro-navy">
              No pages yet
            </p>
            <p className="mt-1 text-[12px] text-[color:var(--color-pm-text-secondary)]">
              Pages will appear here once your site is built.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {pages.map((page) => (
              <li key={page.id}>
                <button
                  type="button"
                  onClick={() => onOpenPage(page.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#FBF9F7] focus:bg-[#FBF9F7] focus:outline-none"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F5F1EA] text-alloro-navy/70">
                    <FileText size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[13px] font-semibold text-alloro-navy">
                      {page.path || "/"}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[color:var(--color-pm-text-secondary)]">
                      Updated {formatDate(page.updated_at)}
                    </span>
                  </span>
                  <StatusPill status={page.status} />
                  <ChevronRight size={16} className="shrink-0 text-alloro-navy/30" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
