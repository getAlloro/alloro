import { AnimatePresence, motion } from "framer-motion";
import { LifeBuoy, X } from "lucide-react";
import type {
  CreateSupportTicketPayload,
  SupportTicketType,
} from "../../api/support";
import { SupportTicketComposer } from "./SupportTicketComposer";

export type SupportTicketComposerModalProps = {
  isOpen: boolean;
  locationId?: number | null;
  isSubmitting: boolean;
  errorMessage?: string | null;
  draftKey?: string | null;
  initialType?: SupportTicketType;
  initialFiles?: File[];
  animatedFileNames?: string[];
  sourceUrl?: string;
  onClose: () => void;
  onCreateTicket: (payload: CreateSupportTicketPayload, files: File[]) => void;
};

export function SupportTicketComposerModal({
  isOpen,
  locationId,
  isSubmitting,
  errorMessage,
  draftKey,
  initialType,
  initialFiles,
  animatedFileNames,
  sourceUrl,
  onClose,
  onCreateTicket,
}: SupportTicketComposerModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-alloro-navy/35 px-4 py-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-ticket-modal-title"
            className="max-h-[calc(100vh-48px)] w-full max-w-[760px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(17,21,28,0.22)] sm:p-6"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  <LifeBuoy className="h-3.5 w-3.5 text-alloro-orange" />
                  Support request
                </p>
                <h2
                  id="support-ticket-modal-title"
                  className="font-display text-[24px] font-normal leading-tight tracking-tight text-alloro-navy"
                >
                  New ticket
                </h2>
                <p className="mt-1.5 max-w-[520px] text-[13px] leading-relaxed text-slate-500">
                  Give the team the few details needed to route and start the
                  request.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                aria-label="Close ticket form"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <SupportTicketComposer
              key={draftKey ?? "manual"}
              locationId={locationId}
              isSubmitting={isSubmitting}
              errorMessage={errorMessage}
              initialType={initialType}
              initialFiles={initialFiles}
              animatedFileNames={animatedFileNames}
              sourceUrl={sourceUrl}
              onCreateTicket={onCreateTicket}
            />
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
