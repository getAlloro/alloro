import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { PmTask } from "../../types/pm";
import { usePmStore } from "../../stores/pmStore";
import { usePmTaskAttachments } from "../../hooks/queries/usePmTaskAttachments";
import { usePmTaskComments } from "../../hooks/queries/usePmTaskComments";
import { formatDeadline, endOfDayPST } from "../../utils/pmDateFormat";
import { PriorityTriangle } from "./PriorityTriangle";
import { RichTextEditor } from "./RichTextEditor";
import { triggerCelebration } from "./CompletionCelebration";
import { AttachmentsSection } from "./AttachmentsSection";
import { CommentsSection } from "./CommentsSection";
import { PmTabs } from "./PmTabs";
import { AnimatedSelect } from "./AnimatedSelect";
import { DeadlinePicker } from "./DeadlinePicker";

const PRIORITIES = [
  { value: "P1", label: "Top of the hour" },
  { value: "P2", label: "Today" },
  { value: "P3", label: "3 days" },
  { value: "P4", label: "This week" },
  { value: "P5", label: "Next week" },
] as const;

export type TaskDetailTab = "details" | "attachments" | "comments";

interface TaskDetailPanelProps {
  task: PmTask | null;
  onClose: () => void;
  isBacklog?: boolean;
  initialTab?: TaskDetailTab;
}

export function TaskDetailPanel({
  task,
  onClose,
  isBacklog,
  initialTab,
}: TaskDetailPanelProps) {
  const taskId = task?.id ?? null;
  const commentState = usePmTaskComments(taskId);
  const attachmentState = usePmTaskAttachments(taskId);
  const updateTask = usePmStore((s) => s.updateTask);
  const assignTask = usePmStore((s) => s.assignTask);
  const deleteTask = usePmStore((s) => s.deleteTask);
  const activeProject = usePmStore((s) => s.activeProject);
  const prevColumnIdRef = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"P1" | "P2" | "P3" | "P4" | "P5">("P3");
  const [deadline, setDeadline] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [assignedTo, setAssignedTo] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TaskDetailTab>("details");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setPriority(task.priority ?? "P3");
      setDeadline(task.deadline ? new Date(task.deadline).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) : "");
      setAssignedTo(task.assigned_to ?? null);
      setShowDeleteConfirm(false);
      setActiveTab(initialTab ?? "details");
    }
  }, [initialTab, task]);

  // Celebration: when this task's column changes into a Done column while the
  // panel is open, fire a burst. Only on transition, never on initial mount.
  useEffect(() => {
    if (!task) {
      prevColumnIdRef.current = null;
      return;
    }
    const prev = prevColumnIdRef.current;
    const current = task.column_id;
    if (prev && prev !== current) {
      const newCol = activeProject?.columns.find((c) => c.id === current);
      if (newCol?.name === "Done") {
        setTimeout(() => triggerCelebration(task.id), 30);
      }
    }
    prevColumnIdRef.current = current;
  }, [task, activeProject]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  if (!task) return null;

  const handleTitleBlur = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) {
      updateTask(task.id, { title: trimmed });
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== (task.description || "")) {
      updateTask(task.id, { description: description || null });
    }
  };

  const handlePriorityChange = (p: "P1" | "P2" | "P3" | "P4" | "P5") => {
    setPriority(p);
    // Auto-set deadline to today for P1/P2 if no deadline
    if (["P1", "P2"].includes(p) && !deadline) {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      setDeadline(today);
      updateTask(task.id, { priority: p, deadline: endOfDayPST(today) });
    } else {
      updateTask(task.id, { priority: p });
    }
  };

  const handleDeadlineChange = (value: string) => {
    setDeadline(value);
    updateTask(task.id, {
      deadline: value ? endOfDayPST(value) : null,
    });
  };

  const handleAssignChange = (userId: number | null) => {
    setAssignedTo(userId);
    assignTask(task.id, userId);
  };

  const handleDelete = async () => {
    await deleteTask(task.id);
    onClose();
  };

  const deadlineDisplay = task.completed_at ? null : formatDeadline(task.deadline);

  const isCompletedLate = !!task.completed_at && !!task.deadline && (
    new Date(task.completed_at).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) > task.deadline.slice(0, 10)
  );

  const assigneeOptions: Array<{ value: number | null; label: string }> = [
    { value: null, label: "Unassigned" },
    ...commentState.users.map((u) => ({
      value: u.id as number | null,
      label: u.display_name,
    })),
  ];

  return (
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 z-50 h-full w-[50vw] max-w-[720px] min-w-[400px] overflow-y-auto border-l shadow-xl"
            style={{ borderColor: "var(--color-pm-border)", backgroundColor: "var(--color-pm-bg-secondary)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-pm-border px-6 py-4">
              <div className="flex items-center gap-2">
                {task.source === "ai_synth" && (
                  <span className="flex items-center gap-1 rounded-full bg-pm-accent/10 px-2.5 py-1 text-xs font-medium text-pm-accent">
                    <Sparkles className="h-3 w-3" />
                    AI Synth
                  </span>
                )}
                {deadlineDisplay && (
                  <span className={`text-xs font-medium ${deadlineDisplay.colorClass}`}>
                    {deadlineDisplay.text}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Title (always visible above tabs) */}
            <div className="px-6 pt-6">
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => e.key === "Enter" && titleRef.current?.blur()}
                className="w-full bg-transparent text-lg font-bold text-pm-text-primary placeholder:text-pm-text-muted focus:outline-none"
                placeholder="Task title"
              />
            </div>

            {/* Tabs */}
            <div className="mt-4 px-6">
              <PmTabs
                tabs={[
                  { id: "details", label: "Details" },
                  {
                    id: "comments",
                    label: "Comments",
                    count: commentState.comments.length,
                  },
                  {
                    id: "attachments",
                    label: "Attachments",
                    count: attachmentState.attachments.length,
                  },
                ]}
                activeId={activeTab}
                onChange={(id) => setActiveTab(id as TaskDetailTab)}
              />
            </div>

            {/* Tab bodies — always mounted so counts stay live; hidden via
                CSS when inactive. Keeps tab switching instant and avoids
                losing in-flight state (e.g. a draft comment). */}
            <div className="px-6 py-6">
              {/* DETAILS */}
              <div className={activeTab === "details" ? "space-y-6" : "hidden"}>
                {/* Description (Rich Text) */}
                <div onBlur={handleDescriptionBlur}>
                  <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                    Description
                  </label>
                  <RichTextEditor
                    value={description}
                    onChange={setDescription}
                    minHeight={140}
                    placeholder="Add a description..."
                  />
                </div>

                {/* Assigned To */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                    Assigned To
                  </label>
                  <AnimatedSelect<number | null>
                    value={assignedTo}
                    options={assigneeOptions}
                    onChange={handleAssignChange}
                    placeholder="Unassigned"
                  />
                </div>

                {/* Priority */}
                {isBacklog ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                      Priority
                    </label>
                    <p className="text-xs text-pm-text-muted">
                      Move out of Backlog to set priority
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                      Priority
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PRIORITIES.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => handlePriorityChange(p.value)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                            priority === p.value
                              ? "bg-pm-bg-hover text-pm-text-primary ring-1 ring-pm-border-hover"
                              : "text-pm-text-muted hover:bg-pm-bg-hover"
                          }`}
                        >
                          <PriorityTriangle priority={p.value} size={12} />
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Deadline */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                    Deadline
                  </label>
                  <DeadlinePicker
                    value={deadline}
                    onChange={handleDeadlineChange}
                  />
                </div>

                {/* Completed At (read-only, shown when task is done) */}
                {task.completed_at && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                      Completed
                    </label>
                    <div
                      className="flex items-center gap-2 rounded-lg py-2 px-3 text-sm"
                      style={{
                        backgroundColor: "var(--color-pm-bg-primary)",
                        border: "1px solid var(--color-pm-border)",
                        color: "#3D8B40",
                      }}
                    >
                      <span>
                        {new Date(task.completed_at).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "America/Los_Angeles",
                        })}
                      </span>
                      {isCompletedLate && (
                        <span className="text-[11px] font-semibold text-[#C43333] ml-auto">
                          completed late
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {(task.creator_name || task.created_at) && (
                  <p className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
                    {task.creator_name && <>Created by <span className="font-medium">{task.creator_name}</span></>}
                    {task.created_at && <> · {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</>}
                  </p>
                )}

                {/* Delete */}
                <div className="border-t border-pm-border pt-6">
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-pm-danger hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete task
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-pm-text-secondary">
                        Are you sure?
                      </span>
                      <button
                        onClick={handleDelete}
                        className="rounded-lg bg-pm-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-pm-text-muted hover:text-pm-text-primary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* COMMENTS */}
              <div className={activeTab === "comments" ? "" : "hidden"}>
                <CommentsSection
                  taskId={task.id}
                  taskCreatedBy={task.created_by}
                  commentState={commentState}
                  attachmentState={attachmentState}
                />
              </div>

              {/* ATTACHMENTS */}
              <div className={activeTab === "attachments" ? "" : "hidden"}>
                <AttachmentsSection
                  taskId={task.id}
                  taskCreatedBy={task.created_by}
                  attachmentState={attachmentState}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
