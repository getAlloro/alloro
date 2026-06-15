import {
  Mail,
  MailOpen,
  Trash2,
  Eye,
  ShieldAlert,
  Circle,
  CheckCircle,
  Send,
  Loader2,
} from "lucide-react";
import type { FormSubmission } from "../../../../api/websites";
import { previewFields, relativeTime } from "../formSubmissionsTab.utils";
import SubmissionStatusChip from "./SubmissionStatusChip";

interface SubmissionRowProps {
  sub: FormSubmission;
  isMultiSelected: boolean;
  isSending: boolean;
  canUseBulkActions: boolean;
  canResendSubmission: boolean;
  toggleSelectItem: (id: string, e: React.MouseEvent) => void;
  handleSelect: (sub: FormSubmission) => Promise<void>;
  handleSendSingle: (sub: FormSubmission, e: React.MouseEvent) => Promise<void>;
  handleToggleRead: (sub: FormSubmission) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
}

export default function SubmissionRow({
  sub,
  isMultiSelected,
  isSending,
  canUseBulkActions,
  canResendSubmission,
  toggleSelectItem,
  handleSelect,
  handleSendSingle,
  handleToggleRead,
  handleDelete,
}: SubmissionRowProps) {
  return (
                  <div
                    className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-gray-50 ${
                      isMultiSelected
                        ? "bg-blue-50 border-l-2 border-blue-400"
                        : !sub.is_read
                          ? "bg-alloro-orange/5"
                          : sub.is_flagged
                            ? "bg-amber-50/50"
                            : ""
                    }`}
                    onClick={() => handleSelect(sub)}
                  >
                    {canUseBulkActions && (
                      <button
                        onClick={(e) => toggleSelectItem(sub.id, e)}
                        className="flex-shrink-0 text-gray-300 transition hover:text-blue-500"
                        title={isMultiSelected ? "Deselect" : "Select"}
                        aria-label={isMultiSelected ? "Deselect submission" : "Select submission"}
                      >
                        {isMultiSelected ? (
                          <CheckCircle size={16} className="text-blue-500" />
                        ) : (
                          <Circle size={16} />
                        )}
                      </button>
                    )}

                    <div className="flex-shrink-0">
                      {sub.is_flagged ? (
                        <ShieldAlert size={16} className="text-amber-500" />
                      ) : sub.is_read ? (
                        <MailOpen size={16} className="text-gray-300" />
                      ) : (
                        <Mail size={16} className="text-alloro-orange" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm ${!sub.is_read ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                          {sub.form_name}
                        </span>
                        <SubmissionStatusChip submission={sub} />
                        {sub.recipients_sent_to.length > 0 ? (
                          <span
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500"
                            title={sub.recipients_sent_to.join(", ")}
                          >
                            {sub.recipients_sent_to.length} recipient{sub.recipients_sent_to.length === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span
                            className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600"
                            title="No recipients were resolved when this submission was saved"
                          >
                            no email
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-gray-500">
                        {previewFields(sub.contents)}
                      </p>
                    </div>

                    <div className="hidden flex-shrink-0 text-xs text-gray-400 sm:block">
                      {relativeTime(sub.submitted_at)}
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-1">
                      {canResendSubmission && (
                        <button
                          onClick={(e) => handleSendSingle(sub, e)}
                          disabled={isSending}
                          className={`p-1.5 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${sub.is_flagged ? "hover:bg-amber-50 text-amber-400 hover:text-amber-600" : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"}`}
                          title={
                            isSending
                              ? "Resending to current configured recipients"
                              : "Resend to current configured recipients"
                          }
                          aria-label={isSending ? "Resending submission" : "Resend submission"}
                        >
                          {isSending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Send size={14} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleRead(sub); }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                        title={sub.is_read ? "Mark unread" : "Mark read"}
                        aria-label={sub.is_read ? "Mark unread" : "Mark read"}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(sub.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition"
                        title="Delete"
                        aria-label="Delete submission"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
  );
}
