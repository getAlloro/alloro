import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { X, FileText } from "lucide-react";
import type { SubmissionDetail } from "../../../../types/leadgen";
import { tokenizeJson } from "../leadgenSubmissionDetail.utils";

/**
 * Dark slide-up deck for the raw audit payload. Positioned absolutely
 * inside the drawer aside so it covers only the drawer (not the whole
 * viewport). Framer-motion handles the slide-up animation.
 *
 * JSON is colorized by tokenizing the string and rendering each token as
 * its own <span>. No HTML injection prop, no new dependency, no XSS
 * surface even if a step payload contains raw HTML-looking text.
 */
export default function AuditPayloadSheet({
  audit,
  onClose,
}: {
  audit: NonNullable<SubmissionDetail["audit"]>;
  onClose: () => void;
}) {
  const tokens = tokenizeJson(audit);
  // Force the scroll region to the top on mount. Without this, if a
  // user-agent caches the sheet's previous scrollTop (or if the motion
  // enter animation somehow lands with scrollTop>0) the JSON would open
  // scrolled to the middle/bottom.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      // `fixed` (not `absolute`) so the deck's position is anchored to
      // the viewport, not to the drawer's scrolled content. Previously
      // `absolute inset-0` meant the deck scrolled with the aside,
      // showing the middle of the JSON by default when the user had
      // scrolled down to click the audit bar.
      className="fixed top-0 right-0 h-full w-full max-w-xl z-[60] flex flex-col bg-slate-900 text-slate-100"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-4 w-4 text-slate-400 shrink-0" />
          <h3 className="text-sm font-semibold text-white">Audit payload</h3>
          <span className="text-[10px] font-mono text-slate-500 truncate">
            {audit.id}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close payload"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-4">
        <pre className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-all">
          {tokens.map((t, i) =>
            t.cls ? (
              <span key={i} className={t.cls}>
                {t.text}
              </span>
            ) : (
              <span key={i}>{t.text}</span>
            )
          )}
        </pre>
      </div>
    </motion.div>
  );
}
