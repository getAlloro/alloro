import { useMemo, useState } from "react";
import {
  useAdminEmailLog,
  useAdminEmailLogs,
} from "../../hooks/queries/useAdminEmailLogs";
import type {
  EmailLogListItem,
  EmailLogListParams,
} from "../../api/email-logs";

/**
 * Email Logs dashboard (plans/07062026-email-logs-dashboard T9).
 * Internal-admin, read-only. Renders every email captured at the sendEmail
 * choke-point, filterable by category/status/date, with the full sent HTML in
 * a sandboxed iframe. Viewer only — no template editing.
 */

const CATEGORY_OPTIONS = [
  "auth",
  "account",
  "billing",
  "support",
  "notification",
  "leadgen",
  "website_form",
  "system",
  "uncategorized",
] as const;

const STATUS_OPTIONS = [
  "queued",
  "sent",
  "failed",
  "delivered",
  "opened",
  "bounced",
  "complained",
] as const;

const STATUS_STYLE: Record<string, string> = {
  delivered: "bg-green-100 text-green-800",
  opened: "bg-emerald-100 text-emerald-900",
  sent: "bg-blue-100 text-blue-800",
  queued: "bg-gray-100 text-gray-700",
  failed: "bg-red-100 text-red-800",
  bounced: "bg-red-100 text-red-800",
  complained: "bg-red-100 text-red-800",
};

const PAGE_SIZE = 25;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${cls}`}
      title={status === "opened" ? "Open tracking is best-effort (~50% accurate)" : undefined}
    >
      {status}
      {status === "opened" ? " *" : ""}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
      {category}
    </span>
  );
}

function recipientLabel(row: EmailLogListItem): string {
  const list = row.intercepted && row.original_recipients?.length
    ? row.original_recipients
    : row.recipients;
  if (!list || list.length === 0) return "—";
  return list.length === 1 ? list[0] : `${list[0]} +${list.length - 1}`;
}

function EmailLogDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError } = useAdminEmailLog(id);
  const log = data?.log;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {log?.subject ?? "Email detail"}
          </h2>
          <button
            className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {isLoading && <div className="p-6 text-sm text-gray-500">Loading…</div>}
        {isError && (
          <div className="p-6 text-sm text-red-600">Failed to load this email.</div>
        )}

        {log && (
          <div className="flex min-h-0 flex-1 flex-col">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-gray-200 px-5 py-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">Category</dt>
                <dd className="mt-0.5"><CategoryBadge category={log.category} /></dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="mt-0.5"><StatusBadge status={log.status} /></dd>
              </div>
              <div>
                <dt className="text-gray-500">Sent</dt>
                <dd className="mt-0.5 font-medium text-gray-800">{formatDateTime(log.created_at)}</dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-gray-500">Recipients</dt>
                <dd className="mt-0.5 font-medium text-gray-800">
                  {(log.intercepted && log.original_recipients?.length
                    ? log.original_recipients
                    : log.recipients
                  ).join(", ") || "—"}
                  {log.intercepted && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      intercepted → {log.recipients.join(", ")}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">From</dt>
                <dd className="mt-0.5 font-medium text-gray-800">
                  {log.from_name ? `${log.from_name} <${log.from_email}>` : log.from_email ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Delivered</dt>
                <dd className="mt-0.5 font-medium text-gray-800">{formatDateTime(log.delivered_at)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Opened *</dt>
                <dd className="mt-0.5 font-medium text-gray-800">{formatDateTime(log.opened_at)}</dd>
              </div>
              {log.error && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-gray-500">Error</dt>
                  <dd className="mt-0.5 font-medium text-red-700">{log.error}</dd>
                </div>
              )}
            </dl>

            <div className="min-h-0 flex-1 overflow-auto bg-gray-50 p-4">
              {/* Sandboxed: no scripts, no same-origin — stored HTML is untrusted (§17.4). */}
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={log.body_html ?? "<p>(no body)</p>"}
                className="h-[55vh] w-full rounded border border-gray-200 bg-white"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EmailLogs() {
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = useMemo<EmailLogListParams>(
    () => ({
      category: category || undefined,
      status: status || undefined,
      search: search || undefined,
      from: from ? `${from}T00:00:00` : undefined,
      to: to ? `${to}T23:59:59` : undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [category, status, search, from, to, page]
  );

  const { data, isLoading, isError } = useAdminEmailLogs(params);
  const logs = data?.logs ?? [];
  const pagination = data?.pagination;

  const resetToFirstPage = () => setPage(1);

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Email Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every email sent by the app, captured at the send choke-point. Read-only.
          <span className="ml-1 text-gray-400">“opened” is best-effort (*).</span>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600">
          <span className="mb-1 block">Category</span>
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={category}
            onChange={(e) => { setCategory(e.target.value); resetToFirstPage(); }}
          >
            <option value="">All</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          <span className="mb-1 block">Status</span>
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={status}
            onChange={(e) => { setStatus(e.target.value); resetToFirstPage(); }}
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          <span className="mb-1 block">From</span>
          <input
            type="date"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={from}
            onChange={(e) => { setFrom(e.target.value); resetToFirstPage(); }}
          />
        </label>
        <label className="text-xs text-gray-600">
          <span className="mb-1 block">To</span>
          <input
            type="date"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={to}
            onChange={(e) => { setTo(e.target.value); resetToFirstPage(); }}
          />
        </label>
        <label className="flex-1 text-xs text-gray-600">
          <span className="mb-1 block">Search (subject or recipient)</span>
          <input
            type="text"
            placeholder="e.g. invoice, client@practice.com"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetToFirstPage(); }}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Sent</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 font-medium">Recipient</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => setSelectedId(row.id)}
              >
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDateTime(row.created_at)}</td>
                <td className="px-3 py-2"><CategoryBadge category={row.category} /></td>
                <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                <td className="max-w-md truncate px-3 py-2 text-gray-800">{row.subject ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">{recipientLabel(row)}</td>
              </tr>
            ))}
            {!isLoading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                  {isError ? "Failed to load email logs." : "No emails match these filters."}
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400">Loading…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
          </span>
          <div className="flex gap-2">
            <button
              className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedId && (
        <EmailLogDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
