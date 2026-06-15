import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Upload, FileText, ArrowLeft, Check, XIcon, Loader2, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { PmAiSynthBatch, PmAiSynthBatchTask } from "../../types/pm";
import { extractBatch, fetchBatches, fetchBatch, approveBatchTask, rejectBatchTask, deleteBatch } from "../../api/pm";
import { PriorityTriangle } from "./PriorityTriangle";
import { RichTextPreview } from "./RichTextEditor";
import { usePmStore } from "../../stores/pmStore";

type View = "grid" | "detail" | "new";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  synthesizing: { bg: "rgba(212,146,10,0.1)", text: "#D4920A", label: "Synthesizing..." },
  pending_review: { bg: "rgba(91,155,213,0.1)", text: "#5B9BD5", label: "Review" },
  completed: { bg: "rgba(61,139,64,0.1)", text: "#3D8B40", label: "Completed" },
  failed: { bg: "rgba(196,51,51,0.1)", text: "#C43333", label: "Failed" },
};

interface AISynthModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function AISynthModal({ isOpen, onClose, projectId }: AISynthModalProps) {
  const [view, setView] = useState<View>("grid");
  const [batches, setBatches] = useState<PmAiSynthBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<PmAiSynthBatch | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchProjectFn = usePmStore((s) => s.fetchProject);

  const loadBatches = useCallback(async () => {
    try {
      const res = await fetchBatches(projectId);
      setBatches(res.data);
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) { loadBatches(); setView("grid"); setError(null); }
  }, [isOpen, loadBatches]);

  const handleExtract = async () => {
    if (!text.trim() && !file) return;
    setIsExtracting(true);
    setError(null);
    try {
      const batch = await extractBatch(projectId, text || undefined, file || undefined);
      setActiveBatch(batch);
      setView("detail");
      setText("");
      setFile(null);
      loadBatches();
    } catch (err: unknown) {
      const errMsg = (typeof err === 'object' && err !== null && 'error' in err)
        ? String((err as Record<string, unknown>).error)
        : "Extraction failed. Try again.";
      setError(errMsg);
    } finally {
      setIsExtracting(false);
    }
  };

  const openBatch = async (batchId: string) => {
    const batch = await fetchBatch(batchId);
    setActiveBatch(batch);
    setView("detail");
  };

  const handleApprove = async (taskId: string) => {
    if (!activeBatch) return;
    await approveBatchTask(activeBatch.id, taskId);
    const updated = await fetchBatch(activeBatch.id);
    setActiveBatch(updated);
    loadBatches();
    fetchProjectFn(projectId);
  };

  const handleReject = async (taskId: string) => {
    if (!activeBatch) return;
    await rejectBatchTask(activeBatch.id, taskId);
    const updated = await fetchBatch(activeBatch.id);
    setActiveBatch(updated);
    loadBatches();
  };

  const handleDeleteBatch = async (batchId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await deleteBatch(batchId);
    if (activeBatch?.id === batchId) { setActiveBatch(null); setView("grid"); }
    loadBatches();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl overflow-hidden max-h-[85vh] flex flex-col"
            style={{ backgroundColor: "var(--color-pm-bg-secondary)", boxShadow: "0 16px 48px rgba(0,0,0,0.25)", border: "1px solid var(--color-pm-border)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--color-pm-border-subtle)" }}>
              <div className="flex items-center gap-3">
                {view !== "grid" && (
                  <button onClick={() => setView("grid")} className="rounded-lg p-1" style={{ color: "var(--color-pm-text-muted)" }}>
                    <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                )}
                <Sparkles className="h-5 w-5 text-[#D66853]" strokeWidth={1.5} />
                <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>
                  {view === "grid" ? "AI Synth" : view === "new" ? "New Synth" : "Batch Review"}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {view === "grid" && (
                  <button onClick={() => setView("new")} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ backgroundColor: "#D66853" }}>
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} /> New Synth
                  </button>
                )}
                <button onClick={onClose} className="rounded-lg p-1.5" style={{ color: "var(--color-pm-text-muted)" }}>
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error && <div className="mb-4 rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "rgba(196,51,51,0.1)", color: "#C43333", border: "1px solid rgba(196,51,51,0.2)" }}>{error}</div>}

              {/* GRID VIEW */}
              {view === "grid" && (
                batches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Sparkles className="h-8 w-8 mb-3" style={{ color: "var(--color-pm-text-muted)" }} strokeWidth={1.5} />
                    <p className="text-[14px] mb-1" style={{ color: "var(--color-pm-text-primary)" }}>No synth batches yet</p>
                    <p className="text-[12px] mb-4" style={{ color: "var(--color-pm-text-muted)" }}>Paste text or upload a document to extract tasks</p>
                    <button onClick={() => setView("new")} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white" style={{ backgroundColor: "#D66853" }}>New Synth</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {batches.map((b) => {
                      const st = STATUS_STYLES[b.status] || STATUS_STYLES.completed;
                      const pending = b.total_proposed - b.total_approved - b.total_rejected;
                      return (
                        <motion.div
                          key={b.id}
                          whileHover={{ y: -1 }}
                          className="group relative text-left rounded-xl p-4 transition-shadow duration-150 cursor-pointer"
                          style={{ backgroundColor: "var(--color-pm-bg-primary)", boxShadow: "var(--pm-shadow-card)", border: "1px solid var(--color-pm-border-subtle)" }}
                          onClick={() => b.status !== "synthesizing" && openBatch(b.id)}
                        >
                          {/* Delete button */}
                          <button
                            onClick={(e) => handleDeleteBatch(b.id, e)}
                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 rounded p-1 transition-opacity duration-150"
                            style={{ color: "var(--color-pm-text-muted)" }}
                            title="Delete batch"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>

                          <div className="flex items-start justify-between mb-2 pr-6">
                            <p className="text-[13px] font-medium truncate flex-1" style={{ color: "var(--color-pm-text-primary)" }}>
                              {b.source_filename || (b.source_text?.slice(0, 50) + "...")}
                            </p>
                            <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ml-2" style={{ backgroundColor: st.bg, color: st.text }}>
                              {st.label}
                            </span>
                          </div>

                          {/* Progress bar for pending_review */}
                          {b.status === "pending_review" && b.total_proposed > 0 && (
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-pm-bg-hover)" }}>
                                <div className="h-full rounded-full" style={{ width: `${((b.total_approved + b.total_rejected) / b.total_proposed) * 100}%`, backgroundColor: "#3D8B40" }} />
                              </div>
                              <span className="text-[10px] font-medium" style={{ color: "var(--color-pm-text-muted)" }}>
                                {b.total_approved + b.total_rejected}/{b.total_proposed}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--color-pm-text-secondary)" }}>
                            {b.total_proposed > 0 && (
                              <>
                                {b.total_approved > 0 && <span className="text-[#3D8B40]">{b.total_approved} approved</span>}
                                {b.total_rejected > 0 && <><span style={{ color: "var(--color-pm-text-muted)" }}>·</span><span className="text-[#C43333]">{b.total_rejected} rejected</span></>}
                                {pending > 0 && <><span style={{ color: "var(--color-pm-text-muted)" }}>·</span><span>{pending} pending</span></>}
                              </>
                            )}
                            {b.total_proposed === 0 && b.status === "completed" && b.total_approved === 0 && b.total_rejected === 0 && <span className="text-[#C43333]">Extraction failed</span>}
                            {b.total_proposed === 0 && b.status === "completed" && <span>No tasks extracted</span>}
                          </div>
                          <p className="text-[10px] mt-1" style={{ color: "var(--color-pm-text-muted)" }}>{formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}</p>
                        </motion.div>
                      );
                    })}
                  </div>
                )
              )}

              {/* NEW VIEW */}
              {view === "new" && (
                <div className="space-y-4">
                  <p className="text-[13px]" style={{ color: "var(--color-pm-text-secondary)" }}>Paste text or upload a file. AI will extract actionable tasks.</p>
                  <textarea
                    value={text}
                    onChange={(e) => { setText(e.target.value); if (e.target.value) setFile(null); }}
                    rows={6}
                    placeholder="Paste an email, meeting notes, or any document..."
                    className="w-full rounded-lg px-4 py-3 text-[13px] outline-none resize-none"
                    style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)" }}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-lg p-5 text-center"
                    style={{ border: "2px dashed var(--color-pm-border)" }}
                  >
                    {file ? (
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-[#D66853]" strokeWidth={1.5} />
                        <span className="text-[13px] font-medium" style={{ color: "var(--color-pm-text-primary)" }}>{file.name}</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
                        <span className="text-[12px]" style={{ color: "var(--color-pm-text-muted)" }}>Drop file or click (.txt, .pdf, .docx, .eml)</span>
                      </>
                    )}
                    <input ref={fileInputRef} type="file" accept=".txt,.pdf,.docx,.eml" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setText(""); } }} className="hidden" />
                  </div>
                  <button onClick={handleExtract} disabled={(!text.trim() && !file) || isExtracting} className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#D66853" }}>
                    {isExtracting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isExtracting ? "Extracting..." : "Extract Tasks"}
                  </button>
                </div>
              )}

              {/* DETAIL VIEW */}
              {view === "detail" && activeBatch && (
                <div className="space-y-3">
                  {/* Source preview */}
                  <details className="rounded-lg" style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border-subtle)" }}>
                    <summary className="px-4 py-2.5 text-[12px] font-medium cursor-pointer" style={{ color: "var(--color-pm-text-muted)" }}>
                      Source: {activeBatch.source_filename || "Pasted text"} ({activeBatch.total_proposed} tasks extracted)
                    </summary>
                    <div className="px-4 pb-3 text-[12px] max-h-32 overflow-y-auto" style={{ color: "var(--color-pm-text-secondary)" }}>
                      {activeBatch.source_text?.slice(0, 500)}
                      {(activeBatch.source_text?.length || 0) > 500 && "..."}
                    </div>
                  </details>

                  {/* Task list */}
                  {activeBatch.tasks?.map((t) => (
                    <BatchTaskCard key={t.id} task={t} batchId={activeBatch.id} onApprove={handleApprove} onReject={handleReject} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function BatchTaskCard({ task, onApprove, onReject }: { task: PmAiSynthBatchTask; batchId: string; onApprove: (id: string) => void; onReject: (id: string) => void }) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  const handleApprove = async () => { setLoading("approve"); await onApprove(task.id); setLoading(null); };
  const handleReject = async () => { setLoading("reject"); await onReject(task.id); setLoading(null); };

  const statusColor = task.status === "approved" ? "#3D8B40" : task.status === "rejected" ? "#C43333" : "var(--color-pm-text-muted)";

  return (
    <div className="rounded-lg p-4" style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border-subtle)" }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <PriorityTriangle priority={task.priority} size={12} />
          <p className="text-[14px] font-semibold truncate" style={{ color: "var(--color-pm-text-primary)" }}>{task.title}</p>
        </div>
        {task.status !== "pending" && (
          <span className="flex-shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${statusColor}20`, color: statusColor }}>
            {task.status === "approved" ? <Check className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
            {task.status}
          </span>
        )}
      </div>

      {task.description && (
        <div className="mb-2 line-clamp-3 overflow-hidden">
          <RichTextPreview html={task.description} />
        </div>
      )}

      {task.deadline_hint && (
        <p className="text-[11px] mb-2" style={{ color: "var(--color-pm-text-muted)" }}>Deadline hint: {task.deadline_hint}</p>
      )}

      {task.status === "pending" && (
        <div className="flex gap-2 mt-2">
          <button onClick={handleApprove} disabled={loading !== null} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#3D8B40" }}>
            {loading === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Approve → Backlog
          </button>
          <button onClick={handleReject} disabled={loading !== null} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50" style={{ color: "#C43333", border: "1px solid rgba(196,51,51,0.3)" }}>
            {loading === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XIcon className="h-3.5 w-3.5" />}
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
