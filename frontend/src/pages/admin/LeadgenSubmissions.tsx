/**
 * LeadgenSubmissions Page
 *
 * Two-tab admin view for the leadgen funnel tracker:
 *   1. Submissions — filterable/paginated list with drawer detail view + CSV
 *   2. Funnel — stage-count bar chart with drop-off percentages
 *
 * Backend endpoints live at /api/admin/leadgen-submissions* (see
 * signalsai-backend routes/admin/leadgenSubmissions.ts). DB tables may not
 * exist yet in lower environments — every request is guarded so the UI
 * renders gracefully on empty/error responses.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Inbox, Search, Download, Activity, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";
import { AdminPageHeader, TabBar } from "../../components/ui/DesignSystem";
import LeadgenSubmissionsTable from "../../components/Admin/leadgen/LeadgenSubmissionsTable";
import LeadgenFunnelChart from "../../components/Admin/leadgen/LeadgenFunnelChart";
import LeadgenSubmissionDetail from "../../components/Admin/leadgen/LeadgenSubmissionDetail";
import LeadgenStatsStrip from "../../components/Admin/leadgen/LeadgenStatsStrip";
import LeadgenBulkActionBar from "../../components/Admin/leadgen/LeadgenBulkActionBar";
import {
  exportSubmissionsCsv,
  getFunnel,
  listSubmissions,
} from "../../api/leadgenSubmissions";
import type {
  FunnelStage,
  ListFilters,
  SubmissionDetail,
  SubmissionSummary,
} from "../../types/leadgen";
import { logger } from "../../lib/logger";

const PAGE_SIZE = 25;

type TabId = "submissions" | "funnel";

export default function LeadgenSubmissions() {
  const [activeTab, setActiveTab] = useState<TabId>("submissions");

  // Filters (applied)
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] =
    useState<ListFilters["status"]>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hasEmail, setHasEmail] = useState(false);
  const [page, setPage] = useState(1);

  // Data
  const [items, setItems] = useState<SubmissionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelError, setFunnelError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  // Multi-select state for the bulk-delete floating action bar.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set<string>()
  );

  // Debounce search input → applied `search`
  const searchDebounce = useRef<number | null>(null);
  useEffect(() => {
    if (searchDebounce.current) {
      window.clearTimeout(searchDebounce.current);
    }
    searchDebounce.current = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => {
      if (searchDebounce.current) window.clearTimeout(searchDebounce.current);
    };
  }, [searchInput]);

  const currentFilters = useMemo<ListFilters>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
      from: from || undefined,
      to: to || undefined,
      hasEmail: hasEmail ? true : undefined,
    }),
    [page, search, status, from, to, hasEmail]
  );

  // `background=true` is what the 5s poll passes — behave like TanStack
  // Query's revalidation: do NOT flip the skeleton state, do NOT wipe
  // existing items on a transient error. Previous data stays on screen
  // until a fresh response replaces it.
  const loadList = useCallback(
    async (opts: { background?: boolean } = {}) => {
      const background = opts.background === true;
      if (!background) {
        setListLoading(true);
        setListError(null);
      }
      try {
        const res = await listSubmissions(currentFilters);
        setItems(res.items);
        setTotal(res.total);
        // Clear a previous error once a good response arrives, even in
        // background mode.
        setListError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load";
        if (background) {
          // Silent poll failure — keep the current list on screen.
          logger.warn("[LeadgenSubmissions] background poll failed:", msg);
        } else {
          setListError(msg);
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!background) setListLoading(false);
      }
    },
    [currentFilters]
  );

  const loadFunnel = useCallback(async () => {
    setFunnelLoading(true);
    setFunnelError(null);
    try {
      const res = await getFunnel({
        from: from || undefined,
        to: to || undefined,
      });
      setStages(res.stages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load funnel";
      setFunnelError(msg);
      setStages([]);
    } finally {
      setFunnelLoading(false);
    }
  }, [from, to]);

  // Fetch list on filter change (only when submissions tab active OR first load)
  useEffect(() => {
    if (activeTab === "submissions") loadList();
  }, [activeTab, loadList]);

  // Live list polling every 5s while the submissions tab is active and the
  // browser tab is visible. Pauses when user switches tabs so backgrounded
  // admins don't hammer the API. Coexists with the drawer's detail polling
  // (different endpoints, no conflict).
  useEffect(() => {
    if (activeTab !== "submissions") return;
    const LIST_POLL_MS = 5000;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible")
        return;
      // Background mode = no skeleton flash, no wipe on transient failure.
      loadList({ background: true });
    };

    const intervalId = window.setInterval(tick, LIST_POLL_MS);
    const visHandler = () => {
      // Refresh immediately when the tab becomes visible again so the admin
      // doesn't have to wait for the next interval tick after switching back.
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        tick();
      }
    };
    document.addEventListener("visibilitychange", visHandler);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", visHandler);
    };
  }, [activeTab, loadList]);

  // Selection helpers — stable callbacks so the table doesn't re-render on
  // every parent render.
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(
    (selectAll: boolean) => {
      setSelectedIds((prev) => {
        if (!selectAll) return new Set();
        const next = new Set(prev);
        for (const s of items) next.add(s.id);
        return next;
      });
    },
    [items]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Merge a freshly-polled detail snapshot into the list row so final_stage
  // and timestamps stay in sync while the drawer is open.
  const handleDetailUpdate = useCallback((detail: SubmissionDetail) => {
    const { session } = detail;
    setItems((prev) => {
      const idx = prev.findIndex((s) => s.id === session.id);
      if (idx === -1) return prev;
      const existing = prev[idx];
      // Shallow-merge only the fields SubmissionSummary cares about — the
      // detail endpoint returns the richer LeadgenSession shape; we keep
      // just the columns the table actually renders.
      const merged: SubmissionSummary = {
        ...existing,
        email: session.email,
        domain: session.domain,
        practice_search_string: session.practice_search_string,
        audit_id: session.audit_id,
        audit_status: session.audit_status ?? existing.audit_status,
        user_agent: session.user_agent ?? existing.user_agent,
        final_stage: session.final_stage,
        completed: !!session.completed,
        abandoned: !!session.abandoned,
        first_seen_at: existing.first_seen_at,
        last_seen_at: session.last_seen_at ?? existing.last_seen_at,
      };
      const copy = prev.slice();
      copy[idx] = merged;
      return copy;
    });
  }, []);

  useEffect(() => {
    if (activeTab === "funnel") loadFunnel();
  }, [activeTab, loadFunnel]);

  // Reset status filter resets page
  const handleStatusChange = (next: ListFilters["status"]) => {
    setStatus(next);
    setPage(1);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportSubmissionsCsv(currentFilters);
      toast.success("CSV export downloaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  // Stats strip only needs date-range filters — keep a stable object so the
  // strip's effect doesn't re-fire on every parent re-render.
  const statsFilters = useMemo(
    () => ({ from: from || undefined, to: to || undefined }),
    [from, to]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<Inbox className="w-6 h-6" />}
        title="Leadgen Submissions"
        description="Track anonymous leadgen tool sessions, email captures, and funnel drop-off."
        actionButtons={
          <button
            onClick={() => {
              if (activeTab === "submissions") {
                loadList();
                setStatsRefreshKey((k) => k + 1);
              } else {
                loadFunnel();
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                listLoading || funnelLoading ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>
        }
      />

      <TabBar
        tabs={[
          {
            id: "submissions",
            label: "Submissions",
            icon: <Inbox className="h-4 w-4" />,
          },
          {
            id: "funnel",
            label: "Funnel",
            icon: <Activity className="h-4 w-4" />,
          },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
      />

      {activeTab === "submissions" && (
        <div className="space-y-4">
          <LeadgenStatsStrip filters={statsFilters} refreshKey={statsRefreshKey} />

          <FilterBar
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            status={status}
            onStatusChange={handleStatusChange}
            from={from}
            onFromChange={(v) => {
              setFrom(v);
              setPage(1);
            }}
            to={to}
            onToChange={(v) => {
              setTo(v);
              setPage(1);
            }}
            hasEmail={hasEmail}
            onHasEmailChange={(v) => {
              setHasEmail(v);
              setPage(1);
            }}
            onExport={handleExport}
            exporting={exporting}
          />

          {listError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Something went wrong loading submissions: {listError}. The
              backend tables may not yet be deployed.
            </div>
          )}

          <LeadgenSubmissionsTable
            items={items}
            loading={listLoading}
            activeId={openId}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onRowClick={(id) => setOpenId(id)}
            onDeleted={(id) => {
              setItems((prev) => prev.filter((s) => s.id !== id));
              setTotal((prev) => Math.max(0, prev - 1));
              setSelectedIds((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              if (openId === id) setOpenId(null);
              toast.success("Session deleted");
              loadList();
            }}
          />

          {total > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      {activeTab === "funnel" && (
        <div className="space-y-4">
          <DateRangeOnlyFilter
            from={from}
            onFromChange={setFrom}
            to={to}
            onToChange={setTo}
          />
          {funnelError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Something went wrong loading funnel data: {funnelError}.
            </div>
          )}
          <LeadgenFunnelChart stages={stages} loading={funnelLoading} />
        </div>
      )}

      <LeadgenSubmissionDetail
        submissionId={openId}
        onClose={() => setOpenId(null)}
        onDetailUpdate={handleDetailUpdate}
        onDeleted={() => {
          const deletedId = openId;
          setOpenId(null);
          if (deletedId) {
            setItems((prev) => prev.filter((s) => s.id !== deletedId));
            setTotal((prev) => Math.max(0, prev - 1));
          }
          toast.success("Session deleted");
          loadList();
        }}
      />

      {/* Floating bulk-action bar — slides up when 1+ rows are selected. */}
      <AnimatePresence>
        {selectedIds.size > 0 && activeTab === "submissions" && (
          <LeadgenBulkActionBar
            selectedIds={selectedIds}
            onClear={handleClearSelection}
            onDeleted={(ids) => {
              const idSet = new Set(ids);
              setItems((prev) => prev.filter((s) => !idSet.has(s.id)));
              setTotal((prev) => Math.max(0, prev - ids.length));
              setSelectedIds(new Set());
              if (openId && idSet.has(openId)) setOpenId(null);
              toast.success(
                `Deleted ${ids.length} session${ids.length === 1 ? "" : "s"}`
              );
              loadList();
              setStatsRefreshKey((k) => k + 1);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------
// Local subcomponents (kept in-file — small + not reused elsewhere)
// ------------------------------------------------------------------

interface FilterBarProps {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  status: ListFilters["status"];
  onStatusChange: (v: ListFilters["status"]) => void;
  from: string;
  onFromChange: (v: string) => void;
  to: string;
  onToChange: (v: string) => void;
  hasEmail: boolean;
  onHasEmailChange: (v: boolean) => void;
  onExport: () => void;
  exporting: boolean;
}

function FilterBar({
  searchInput,
  onSearchInputChange,
  status,
  onStatusChange,
  from,
  onFromChange,
  to,
  onToChange,
  hasEmail,
  onHasEmailChange,
  onExport,
  exporting,
}: FilterBarProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              placeholder="Email or domain"
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) =>
              onStatusChange(e.target.value as ListFilters["status"])
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="abandoned">Abandoned</option>
            <option value="in_progress">In progress</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1">
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={hasEmail}
            onChange={(e) => onHasEmailChange(e.target.checked)}
            className="h-4 w-4 accent-alloro-orange"
          />
          Has email
        </label>

        <button
          onClick={onExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg bg-alloro-navy px-3 py-2 text-sm font-semibold text-white hover:bg-alloro-orange transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>
    </div>
  );
}

function DateRangeOnlyFilter({
  from,
  onFromChange,
  to,
  onToChange,
}: {
  from: string;
  onFromChange: (v: string) => void;
  to: string;
  onToChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-end gap-3">
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1">
          From
        </label>
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1">
          To
        </label>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
        />
      </div>
      {(from || to) && (
        <button
          onClick={() => {
            onFromChange("");
            onToChange("");
          }}
          className="text-xs text-gray-500 hover:text-gray-700 underline pb-3"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
      <span className="text-sm text-gray-600">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of{" "}
        <strong>{total}</strong>
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <span className="text-sm text-gray-500">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
