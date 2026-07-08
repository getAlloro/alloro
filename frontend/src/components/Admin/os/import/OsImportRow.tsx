import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  XCircle,
} from "lucide-react";
import type { OsImportStub } from "../../../../api/admin-os";
import { useAdminOsDocumentImport } from "../../../../hooks/queries/useAdminOsImports";

/**
 * One import row (P6 T4): the file's title + a mono status token that polls
 * pending → converted/failed, with a warnings disclosure. `active` gates the
 * poll so rows stop hitting the server once the modal closes.
 */

type Settled = "pending" | "converted" | "failed";

function statusMeta(status: Settled) {
  switch (status) {
    case "converted":
      return { label: "converted", tone: "text-alloro-success", Icon: CheckCircle2 };
    case "failed":
      return { label: "failed", tone: "text-alloro-danger", Icon: XCircle };
    default:
      return { label: "converting…", tone: "text-gray-400", Icon: Loader2 };
  }
}

export function OsImportRow({
  stub,
  active,
}: {
  stub: OsImportStub;
  active: boolean;
}) {
  const importQuery = useAdminOsDocumentImport(stub.documentId, active);
  const [showWarnings, setShowWarnings] = useState(false);

  const status: Settled =
    (importQuery.data?.status as Settled | undefined) ?? "pending";
  const warnings = importQuery.data?.warnings ?? [];
  const { label, tone, Icon } = statusMeta(status);
  const spinning = status === "pending";

  return (
    <li className="border-t border-line-soft py-2.5 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.5} />
          <span className="truncate text-[13px] text-gray-700" title={stub.filename}>
            {stub.title}
          </span>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 font-mono text-[11px] ${tone}`}
        >
          <Icon
            className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
          {label}
        </span>
      </div>

      {warnings.length > 0 && (
        <div className="mt-1.5 pl-6">
          <button
            type="button"
            onClick={() => setShowWarnings((v) => !v)}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-600 transition-colors duration-150 hover:text-amber-700"
          >
            <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
            {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-150 ${
                showWarnings ? "rotate-180" : ""
              }`}
              strokeWidth={1.5}
            />
          </button>
          {showWarnings && (
            <ul className="mt-1 space-y-1">
              {warnings.map((warning, index) => (
                <li
                  key={index}
                  className="text-[12px] leading-snug text-gray-500"
                >
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
