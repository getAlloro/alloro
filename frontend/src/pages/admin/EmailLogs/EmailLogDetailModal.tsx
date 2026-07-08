import type { ReactNode } from "react";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Mail, X } from "lucide-react";
import { useAdminEmailLog } from "../../../hooks/queries/useAdminEmailLogs";
import { backdropVariants, modalVariants } from "../../../lib/animations";
import { CategoryBadge, StatusBadge } from "./badges";
import { formatDateTime } from "./constants";

/**
 * Email Logs — detail modal (plans/07082026-email-logs-ui-polish).
 * Glass backdrop + spring content; the stored HTML renders in a sandboxed iframe
 * (no scripts, no same-origin) because it is untrusted (§17.4). Mounted under an
 * AnimatePresence in the page so the exit animation runs.
 */

export type EmailLogDetailModalProps = { id: string; onClose: () => void };

function MetaItem({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-gray-800">{children}</dd>
    </div>
  );
}

export default function EmailLogDetailModal({ id, onClose }: EmailLogDetailModalProps) {
  const { data, isLoading, isError } = useAdminEmailLog(id);
  const log = data?.log;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const recipients =
    log && log.intercepted && log.original_recipients?.length
      ? log.original_recipients
      : log?.recipients ?? [];

  return (
    <motion.div
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        variants={modalVariants}
        role="dialog"
        aria-modal="true"
        aria-label={log?.subject ?? "Email detail"}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-alloro-navy text-white">
            <Mail className="h-4 w-4" />
          </div>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-alloro-textDark">
            {log?.subject ?? "Email detail"}
          </h2>
          <button
            type="button"
            aria-label="Close email detail"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading && (
          <div className="space-y-3 p-6">
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
            <div className="mt-4 h-64 w-full animate-pulse rounded-xl bg-gray-100" />
          </div>
        )}
        {isError && (
          <div className="m-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            Failed to load this email.
          </div>
        )}

        {log && (
          <div className="flex min-h-0 flex-1 flex-col">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-gray-100 px-5 py-4 text-sm sm:grid-cols-3">
              <MetaItem label="Category">
                <CategoryBadge category={log.category} />
              </MetaItem>
              <MetaItem label="Status">
                <StatusBadge status={log.status} />
              </MetaItem>
              <MetaItem label="Sent">{formatDateTime(log.created_at)}</MetaItem>
              <MetaItem label="Recipients" className="col-span-2 sm:col-span-3">
                {recipients.join(", ") || "—"}
                {log.intercepted && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    intercepted → {log.recipients.join(", ")}
                  </span>
                )}
              </MetaItem>
              <MetaItem label="From">
                {log.from_name
                  ? `${log.from_name} <${log.from_email}>`
                  : log.from_email ?? "—"}
              </MetaItem>
              <MetaItem label="Delivered">{formatDateTime(log.delivered_at)}</MetaItem>
              <MetaItem label="Opened *">{formatDateTime(log.opened_at)}</MetaItem>
              {log.error && (
                <MetaItem label="Error" className="col-span-2 sm:col-span-3">
                  <span className="font-medium text-red-700">{log.error}</span>
                </MetaItem>
              )}
            </dl>

            <div className="min-h-0 flex-1 overflow-auto bg-alloro-bg p-4">
              {/* Sandboxed: no scripts, no same-origin — stored HTML is untrusted (§17.4). */}
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={log.body_html ?? "<p>(no body)</p>"}
                className="h-[55vh] w-full rounded-xl border border-black/10 bg-white"
              />
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
