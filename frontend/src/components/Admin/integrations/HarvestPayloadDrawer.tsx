import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Database, Loader2, X } from "lucide-react";
import MonacoJsonEditor from "../MonacoJsonEditor";
import type {
  HarvestLog,
  HarvestLogPayload,
  IntegrationPlatform,
} from "../../../api/integrations";

type HarvestPayloadDrawerProps = {
  open: boolean;
  log: HarvestLog | null;
  payload: HarvestLogPayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

const payloadKindLabel: Record<HarvestLogPayload["payloadKind"], string> = {
  stored_data: "Stored data",
  harvest_log: "Harvest log",
};

function formatReportDate(value: string | null | undefined): string {
  if (!value) return "--";
  const datePart = String(value).split("T")[0];
  return new Date(`${datePart}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes < 1) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPlatform(platform: IntegrationPlatform | string | null): string {
  if (!platform) return "--";
  if (platform === "gsc") return "GSC";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function MetadataPill({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-gray-800">
        {value ?? "--"}
      </div>
    </div>
  );
}

export default function HarvestPayloadDrawer({
  open,
  log,
  payload,
  loading,
  error,
  onClose,
}: HarvestPayloadDrawerProps) {
  const editorValue = useMemo(
    () => JSON.stringify(payload?.data ?? null, null, 2),
    [payload],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-4xl flex-col border-l border-gray-200 bg-white shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 330, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-gray-400">
                  <Database className="h-4 w-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Harvest payload
                  </span>
                </div>
                <h3 className="mt-1 truncate text-base font-bold text-gray-950">
                  {formatPlatform(payload?.platform ?? log?.platform ?? null)} -
                  {" "}
                  {formatReportDate(payload?.harvestDate ?? log?.harvest_date)}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close payload inspector"
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-gray-100 px-6 py-3 md:grid-cols-5">
              <MetadataPill
                label="Outcome"
                value={payload?.log.outcome ?? log?.outcome ?? null}
              />
              <MetadataPill
                label="Rows"
                value={payload?.log.rowsFetched ?? log?.rows_fetched ?? null}
              />
              <MetadataPill
                label="Payload"
                value={payload ? payloadKindLabel[payload.payloadKind] : "--"}
              />
              <MetadataPill
                label="Size"
                value={formatBytes(payload?.payloadSizeBytes)}
              />
              <MetadataPill
                label="Log ID"
                value={payload?.log.id.slice(0, 8) ?? log?.id.slice(0, 8) ?? null}
              />
            </div>

            <div className="min-h-0 flex-1 px-6 py-4">
              {loading ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading payload...
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-red-100 bg-red-50 px-6 text-sm text-red-600">
                  <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              ) : (
                <MonacoJsonEditor
                  value={editorValue}
                  onChange={() => undefined}
                  height="100%"
                  readOnly
                />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
