import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { ClarityLegacySnippet } from "../../../api/integrations";

type ClarityLegacyWarningProps = {
  blockers: ClarityLegacySnippet[];
  blockingProjectSnippets: ClarityLegacySnippet[];
  hasTemplateBlocker: boolean;
  isSaving: boolean;
  onDisableLegacy: () => void;
};

export default function ClarityLegacyWarning({
  blockers,
  blockingProjectSnippets,
  hasTemplateBlocker,
  isSaving,
  onDisableLegacy,
}: ClarityLegacyWarningProps) {
  if (blockers.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Legacy Clarity script detected</p>
          <p className="mt-1 text-xs leading-relaxed">
            Disable the old header/footer script before connecting Clarity
            here, otherwise Microsoft can receive duplicate tracking calls.
          </p>
          <div className="mt-3 space-y-2">
            {blockers.map((snippet) => (
              <SnippetRow key={snippet.id} snippet={snippet} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {blockingProjectSnippets.length > 0 && (
              <button
                type="button"
                onClick={onDisableLegacy}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Disable project script
              </button>
            )}
            {hasTemplateBlocker && (
              <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
                Template script must be removed in Code Manager
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SnippetRow({ snippet }: { snippet: ClarityLegacySnippet }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-amber-950">
            {snippet.name}
          </div>
          <div className="mt-0.5 text-[11px] text-amber-700">
            {snippet.scope} / {snippet.location} / project ID {snippet.projectId || "--"}
          </div>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
          Enabled
        </span>
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-amber-700">
        {snippet.codePreview}
      </div>
    </div>
  );
}
