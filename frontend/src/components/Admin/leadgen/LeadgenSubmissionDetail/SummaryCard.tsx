import { motion } from "framer-motion";
import {
  Mail,
  Globe,
  Building2,
  Clock,
  CheckCircle2,
  AlertOctagon,
} from "lucide-react";
import type { SubmissionDetail } from "../../../../types/leadgen";
import {
  formatAbsolute,
  friendlyDeviceLabel,
} from "../leadgenSubmissionDetail.utils";
import StagePillInline from "./StagePillInline";
import SourceBlock from "./SourceBlock";

export default function SummaryCard({ detail }: { detail: SubmissionDetail }) {
  const s = detail.session;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400 shrink-0" />
            <p className="text-sm font-semibold text-gray-900 truncate">
              {s.email || (
                <span className="italic text-gray-400">anonymous</span>
              )}
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
            <Globe className="h-4 w-4 text-gray-400" />
            <span>{s.domain || "—"}</span>
          </div>
          {s.practice_search_string && (
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="truncate">{s.practice_search_string}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Keyed on stage so any time the live poll flips final_stage the
              pill remounts and the initial scale/flash plays — visible
              signal that the funnel advanced. */}
          <motion.div
            key={s.final_stage}
            initial={{ scale: 1.18, boxShadow: "0 0 0 6px rgba(34,197,94,0.25)" }}
            animate={{ scale: 1, boxShadow: "0 0 0 0 rgba(34,197,94,0)" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="rounded-md"
          >
            <StagePillInline stage={s.final_stage} />
          </motion.div>
          {s.completed && (
            <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3 w-3" /> completed
            </span>
          )}
          {s.abandoned && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              <AlertOctagon className="h-3 w-3" /> abandoned
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>First: {formatAbsolute(s.first_seen_at)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>Last: {formatAbsolute(s.last_seen_at)}</span>
        </div>
      </div>

      {s.audit_id && (
        <div className="mt-3 text-xs text-gray-500 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-600">Audit:</span>
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 break-all">
              {s.audit_id}
            </code>
            <a
              href={`https://audit.getalloro.com?audit_id=${encodeURIComponent(s.audit_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-alloro-orange hover:underline"
            >
              Open report ↗
            </a>
          </div>
          {/* Google Places place_id — lifted out of the audit's
              step_self_gbp payload so admins can cross-reference against
              organizations.business_data without opening the raw payload
              deck. Only renders when the audit actually ran (GBP step
              populated). */}
          {(() => {
            const gbp = detail.audit?.step_self_gbp as
              | { placeId?: unknown }
              | null
              | undefined;
            const placeId =
              gbp && typeof gbp.placeId === "string" ? gbp.placeId : null;
            if (!placeId) return null;
            return (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-600">Place ID:</span>
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 break-all">
                  {placeId}
                </code>
              </div>
            );
          })()}
        </div>
      )}
      {(s.user_agent || s.browser || s.os || s.device_type) && (
        <div className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Device:</span>{" "}
          <span className="break-words">{friendlyDeviceLabel(s)}</span>
        </div>
      )}

      <SourceBlock session={s} />
    </section>
  );
}
