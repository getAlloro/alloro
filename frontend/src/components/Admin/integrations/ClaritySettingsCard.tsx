import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Copy,
  KeyRound,
  Loader2,
  Plug,
  Shield,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  ClarityCompleteness,
  ClarityLiveTagState,
  ClarityTokenState,
} from "../../../api/integrations";
import {
  deriveClarityTag,
  extractClarityProjectId,
  isValidClarityProjectId,
  looksLikeClaritySnippet,
} from "./clarity-snippet";

type ClaritySettingsCardProps = {
  clarityProjectId: string;
  connectedProjectId: string | null;
  hasDataExportToken: boolean;
  isBlocked: boolean;
  isSaving: boolean;
  apiToken: string;
  completeness: ClarityCompleteness;
  validating: boolean;
  onProjectIdChange: (value: string) => void;
  onApiTokenChange: (value: string) => void;
  onSave: () => void;
  onValidate: () => void;
};

export default function ClaritySettingsCard({
  clarityProjectId,
  connectedProjectId,
  hasDataExportToken,
  isBlocked,
  isSaving,
  apiToken,
  completeness,
  validating,
  onProjectIdChange,
  onApiTokenChange,
  onSave,
  onValidate,
}: ClaritySettingsCardProps) {
  const [copied, setCopied] = useState(false);

  const showDerivedTag = isValidClarityProjectId(clarityProjectId);
  const derivedTag = showDerivedTag ? deriveClarityTag(clarityProjectId) : "";

  const handleProjectIdChange = (value: string) => {
    if (looksLikeClaritySnippet(value)) {
      const extracted = extractClarityProjectId(value);
      if (extracted) {
        onProjectIdChange(extracted);
        return;
      }
    }
    onProjectIdChange(value);
  };

  const handleCopy = async () => {
    if (!derivedTag) return;
    try {
      await navigator.clipboard.writeText(derivedTag);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

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
            onChange={(event) => handleProjectIdChange(event.target.value)}
            placeholder="r9qqoq5h01"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm font-medium text-gray-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Used for the public tracking script. Paste a full Clarity snippet and we'll pull the ID out.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            API token
          </label>
          <input
            value={apiToken}
            onChange={(event) => onApiTokenChange(event.target.value)}
            placeholder={hasDataExportToken ? "Leave blank to keep current token" : "Required to complete"}
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm font-medium text-gray-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Stored encrypted. Required for Data Export and to mark the integration complete.
          </p>
        </div>
      </div>

      {showDerivedTag && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Tracking script (auto-generated)
            </label>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              {copied ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <textarea
            readOnly
            rows={3}
            value={derivedTag}
            className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-700 outline-none"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Alloro injects this automatically from the Project ID. Shown for reference — you don't need to paste it anywhere.
          </p>
        </div>
      )}

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
        {completeness.isComplete && (
          <StatusPill
            icon={<BadgeCheck className="h-3 w-3" />}
            label="Complete"
            className="bg-emerald-600 text-white"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          {connectedProjectId && (
            <button
              type="button"
              onClick={onValidate}
              disabled={validating || isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Validate installation
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || isBlocked || !clarityProjectId.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
            Save Clarity
          </button>
        </div>
      </div>

      {connectedProjectId && (
        <ValidationChecklist completeness={completeness} />
      )}
    </motion.div>
  );
}

type CheckState = "ok" | "bad" | "warn" | "idle";

function tokenCheck(state: ClarityTokenState | undefined): { state: CheckState; label: string } {
  switch (state) {
    case "valid":
      return { state: "ok", label: "API token valid" };
    case "invalid":
      return { state: "bad", label: "API token invalid or expired" };
    case "missing":
      return { state: "bad", label: "API token not set" };
    case "error":
      return { state: "warn", label: "API token couldn't be verified — try again" };
    default:
      return { state: "idle", label: "API token" };
  }
}

function liveTagCheck(
  state: ClarityLiveTagState | undefined,
  foundProjectIds: string[],
): { state: CheckState; label: string; detail: string | null } {
  switch (state) {
    case "present":
      return { state: "ok", label: "Tracking tag live on site", detail: null };
    case "mismatch":
      return {
        state: "warn",
        label: "A different Clarity project is on the site",
        detail: foundProjectIds.length ? `Found: ${foundProjectIds.join(", ")}` : null,
      };
    case "absent":
      return { state: "bad", label: "Tracking tag not found on the live site", detail: null };
    case "error":
      return { state: "warn", label: "Couldn't reach the site to check", detail: null };
    default:
      return { state: "idle", label: "Tracking tag on site", detail: null };
  }
}

function ValidationChecklist({ completeness }: { completeness: ClarityCompleteness }) {
  const last = completeness.lastValidation;
  const projectIdState: CheckState = last
    ? last.projectIdValid
      ? "ok"
      : "bad"
    : completeness.hasProjectId
      ? "ok"
      : "bad";
  const token = tokenCheck(last?.token);
  const live = liveTagCheck(last?.liveTag.status, last?.liveTag.foundProjectIds ?? []);

  return (
    <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Installation
        </span>
        {last && (
          <span className="text-[11px] text-gray-400">
            Checked {new Date(last.checkedAt).toLocaleString()}
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        <CheckItem state={projectIdState} label="Project ID valid" />
        <CheckItem state={token.state} label={token.label} />
        <CheckItem state={live.state} label={live.label} detail={live.detail} />
      </ul>
      {!last && (
        <p className="mt-2 text-[11px] text-gray-400">
          Not validated yet — run a check to confirm tracking is live.
        </p>
      )}
    </div>
  );
}

function CheckItem({
  state,
  label,
  detail,
}: {
  state: CheckState;
  label: string;
  detail?: string | null;
}) {
  const icon =
    state === "ok" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
    ) : state === "bad" ? (
      <XCircle className="h-3.5 w-3.5 text-red-500" />
    ) : state === "warn" ? (
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
    ) : (
      <Circle className="h-3.5 w-3.5 text-gray-300" />
    );
  return (
    <li className="flex items-start gap-2 text-xs text-gray-700">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        {label}
        {detail && <span className="ml-1 font-mono text-[11px] text-gray-400">{detail}</span>}
      </span>
    </li>
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
