import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldAlert, Send, Loader2 } from "lucide-react";
import type { FormSubmission } from "../../../../api/websites";
import { isSectionsFormat } from "../formSubmissionsTab.utils";
import SubmissionStatusChip from "./SubmissionStatusChip";
import RecipientsSummary from "./RecipientsSummary";
import SectionsView from "./SectionsView";
import FlatView from "./FlatView";

interface SubmissionDetailModalProps {
  currentDetail: FormSubmission | null;
  detailResendRecipients: string[];
  isShowingCurrentRecipients: boolean;
  isCurrentDetailSending: boolean;
  canResendSubmission: boolean;
  detailLoading: boolean;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setDetailSubmission: React.Dispatch<React.SetStateAction<FormSubmission | null>>;
  handleSendSingle: (sub: FormSubmission, e: React.MouseEvent) => Promise<void>;
}

export default function SubmissionDetailModal({
  currentDetail,
  detailResendRecipients,
  isShowingCurrentRecipients,
  isCurrentDetailSending,
  canResendSubmission,
  detailLoading,
  setSelectedId,
  setDetailSubmission,
  handleSendSingle,
}: SubmissionDetailModalProps) {
  return (
            <AnimatePresence>
              {currentDetail && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  onClick={() => { setSelectedId(null); setDetailSubmission(null); }}
                >
                  {/* Backdrop */}
                  <div className="absolute inset-0 bg-alloro-navy/40 backdrop-blur-sm" />

                  {/* Modal content */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="relative flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Modal header */}
                    <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate font-semibold text-gray-900">{currentDetail.form_name}</h4>
                          <SubmissionStatusChip submission={currentDetail} />
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(currentDetail.submitted_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {canResendSubmission && (
                          <button
                            onClick={(e) => handleSendSingle(currentDetail, e)}
                            disabled={isCurrentDetailSending}
                            title={
                              isCurrentDetailSending
                                ? "Resending to current configured recipients"
                                : "Resend to current configured recipients"
                            }
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-sm font-medium border disabled:cursor-not-allowed disabled:opacity-60 ${currentDetail.is_flagged ? "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200" : "bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200"}`}
                          >
                            {isCurrentDetailSending ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Send size={13} />
                            )}
                            {isCurrentDetailSending ? "Sending..." : "Resend"}
                          </button>
                        )}
                        <button
                          onClick={() => { setSelectedId(null); setDetailSubmission(null); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                          aria-label="Close submission details"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Modal body */}
                    <div className="flex-1 overflow-y-auto px-5 py-4">
                      {currentDetail.is_flagged && currentDetail.flag_reason && (
                        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-start gap-2">
                          <ShieldAlert size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-amber-700">Flagged by AI</p>
                            <p className="text-xs text-amber-600 mt-0.5">{currentDetail.flag_reason}</p>
                          </div>
                        </div>
                      )}

                      <RecipientsSummary
                        recipients={detailResendRecipients}
                        title={
                          isShowingCurrentRecipients
                            ? "Current resend recipients"
                            : "Original recipients"
                        }
                        emptyMessage="No recipients are configured for this form."
                      />

                      {detailLoading ? (
                        <div className="text-sm text-gray-400 py-4">Loading file details...</div>
                      ) : isSectionsFormat(currentDetail.contents) ? (
                        <SectionsView sections={currentDetail.contents} />
                      ) : (
                        <FlatView contents={currentDetail.contents} />
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
  );
}
