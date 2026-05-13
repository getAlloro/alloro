import { motion } from "framer-motion";
import { KeyRound, Loader2, Plug, Shield } from "lucide-react";
import type { ReactNode } from "react";

type ClaritySettingsCardProps = {
  clarityProjectId: string;
  connectedProjectId: string | null;
  hasDataExportToken: boolean;
  isBlocked: boolean;
  isSaving: boolean;
  apiToken: string;
  onProjectIdChange: (value: string) => void;
  onApiTokenChange: (value: string) => void;
  onSave: () => void;
};

export default function ClaritySettingsCard({
  clarityProjectId,
  connectedProjectId,
  hasDataExportToken,
  isBlocked,
  isSaving,
  apiToken,
  onProjectIdChange,
  onApiTokenChange,
  onSave,
}: ClaritySettingsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.05 }}
      className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Clarity Project ID
          </label>
          <input
            value={clarityProjectId}
            onChange={(event) => onProjectIdChange(event.target.value)}
            placeholder="r9qqoq5h01"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm font-medium text-gray-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Used for the public tracking script. No token is exposed to the site.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            API token
          </label>
          <input
            value={apiToken}
            onChange={(event) => onApiTokenChange(event.target.value)}
            placeholder={hasDataExportToken ? "Leave blank to keep current token" : "Optional Data Export token"}
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm font-medium text-gray-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Stored encrypted. Required only for recent Data Export harvests.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusPill
          icon={<Shield className="h-3 w-3" />}
          label={connectedProjectId ? "Tracking managed by Alloro" : "Tracking will be installed"}
          className="bg-blue-50 text-blue-700"
        />
        <StatusPill
          icon={<KeyRound className="h-3 w-3" />}
          label={hasDataExportToken ? "Data Export enabled" : "Data Export optional"}
          className={hasDataExportToken ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || isBlocked || !clarityProjectId.trim()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
          Save Clarity
        </button>
      </div>
    </motion.div>
  );
}

function StatusPill({
  icon,
  label,
  className,
}: {
  icon: ReactNode;
  label: string;
  className: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {icon}
      {label}
    </span>
  );
}
