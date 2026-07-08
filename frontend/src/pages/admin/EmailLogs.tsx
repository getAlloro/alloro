import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { useAdminEmailLogs } from "../../hooks/queries/useAdminEmailLogs";
import type { EmailLogListParams } from "../../api/email-logs";
import { AdminPageHeader, ActionButton } from "../../components/ui/DesignSystem";
import EmailLogsFilters from "./EmailLogs/EmailLogsFilters";
import EmailLogsTable from "./EmailLogs/EmailLogsTable";
import EmailLogDetailModal from "./EmailLogs/EmailLogDetailModal";
import { PAGE_SIZE } from "./EmailLogs/constants";

/**
 * Email Logs dashboard (plans/07062026-email-logs-dashboard T9; UI polished in
 * plans/07082026-email-logs-ui-polish). Internal-admin, read-only viewer of
 * every email captured at the sendEmail choke-point, filterable by
 * category/status/date, with the full sent HTML in a sandboxed iframe.
 */
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

  const update =
    (setter: (value: string) => void) =>
    (value: string) => {
      setter(value);
      setPage(1);
    };

  const handleReset = () => {
    setCategory("");
    setStatus("");
    setSearch("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<Mail className="h-6 w-6" />}
        title="Email Logs"
        description={
          <>
            Every email sent by the app, captured at the send choke-point.
            Read-only.{" "}
            <span className="text-gray-400">“opened” is best-effort (*).</span>
          </>
        }
      />

      <EmailLogsFilters
        category={category}
        status={status}
        from={from}
        to={to}
        search={search}
        onCategoryChange={update(setCategory)}
        onStatusChange={update(setStatus)}
        onFromChange={update(setFrom)}
        onToChange={update(setTo)}
        onSearchChange={update(setSearch)}
        onReset={handleReset}
      />

      <EmailLogsTable
        logs={logs}
        isLoading={isLoading}
        isError={isError}
        onSelect={setSelectedId}
        onReset={handleReset}
      />

      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span className="tabular-nums">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
          </span>
          <div className="flex gap-2">
            <ActionButton
              label="Prev"
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
            />
            <ActionButton
              label="Next"
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => setPage((p) => p + 1)}
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
            />
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedId && (
          <EmailLogDetailModal
            id={selectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
