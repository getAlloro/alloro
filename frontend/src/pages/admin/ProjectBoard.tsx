import { useEffect, useState, useCallback, useMemo } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  EyeOff,
  Eye,
  MoreHorizontal,
  Archive,
  Trash2,
  Sparkles,
  Maximize,
  Plus,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { PmTask } from "../../types/pm";
import { usePmStore } from "../../stores/pmStore";
import { KanbanBoard } from "../../components/pm/KanbanBoard";
import { FloatingClock } from "../../components/pm/FloatingClock";
import { TaskDetailPanel } from "../../components/pm/TaskDetailPanel";
import { AISynthModal } from "../../components/pm/AISynthModal";
import { CreateTaskModal } from "../../components/pm/CreateTaskModal";
import { ActivityTimeline } from "../../components/pm/ActivityTimeline";
import { FocusMode } from "../../components/pm/FocusMode";
import { CommandPalette } from "../../components/pm/CommandPalette";
import { CompletionCelebration } from "../../components/pm/CompletionCelebration";
import { MoveToProjectModal } from "../../components/pm/MoveToProjectModal";
import { BulkActionBar } from "../../components/ui/DesignSystem";
import { formatDeadline } from "../../utils/pmDateFormat";
import { showErrorToast } from "../../lib/toast";
import type { TaskContextAction } from "../../components/pm/TaskCard";
import { logger } from "../../lib/logger";
import { resolvePmTaskTab } from "./projectBoardDeepLink.utils";

export default function ProjectBoard() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProject, fetchProject, isLoading, deleteProject, archiveProject } =
    usePmStore();
  const selectedTaskIds = usePmStore((s) => s.selectedTaskIds);
  const toggleTaskSelection = usePmStore((s) => s.toggleTaskSelection);
  const clearTaskSelection = usePmStore((s) => s.clearTaskSelection);
  const bulkDeleteSelectedTasks = usePmStore((s) => s.bulkDeleteSelectedTasks);
  const bulkMoveSelectedTasksToProject = usePmStore((s) => s.bulkMoveSelectedTasksToProject);
  const [selectedTask, setSelectedTask] = useState<PmTask | null>(null);
  const [showBacklog, setShowBacklog] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showAiSynth, setShowAiSynth] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showMoveToProject, setShowMoveToProject] = useState(false);
  const [bulkDeleteConfirmCount, setBulkDeleteConfirmCount] = useState<number | null>(null);
  // Target task ids that the current action applies to — equals selection
  // unless a right-click fired on a non-selected card (single-item mode).
  const [actionTargetIds, setActionTargetIds] = useState<string[] | null>(null);
  const requestedTaskId = searchParams.get("task");
  const requestedTab = resolvePmTaskTab(searchParams.get("tab"));

  useEffect(() => {
    if (projectId) fetchProject(projectId);
  }, [projectId, fetchProject]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleDelete = useCallback(async () => {
    if (activeProject) {
      await deleteProject(activeProject.id);
      navigate("/admin/pm");
    }
  }, [activeProject, deleteProject, navigate]);

  const handleArchive = useCallback(async () => {
    if (activeProject) {
      await archiveProject(activeProject.id);
      navigate("/admin/pm");
    }
  }, [activeProject, archiveProject, navigate]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      await usePmStore.getState().deleteTask(taskId);
    } catch {
      logger.error("[PM] Failed to delete task");
    }
  }, []);

  // Resolve task map for quick lookups
  const allTasks = useMemo(
    () => activeProject?.columns.flatMap((c) => c.tasks) ?? [],
    [activeProject]
  );

  useEffect(() => {
    if (!requestedTaskId || !activeProject) return;
    const task = allTasks.find((candidate) => candidate.id === requestedTaskId);
    if (task) setSelectedTask(task);
  }, [activeProject, allTasks, requestedTaskId]);

  const handleCloseTaskPanel = useCallback(() => {
    setSelectedTask(null);
    if (!searchParams.has("task") && !searchParams.has("tab")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    next.delete("tab");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Selection diagnostics: are all selected (or action-target) tasks in Backlog?
  const allTargetsInBacklog = useMemo(() => {
    if (!activeProject) return false;
    const targetIds =
      actionTargetIds && actionTargetIds.length > 0
        ? actionTargetIds
        : [...selectedTaskIds];
    if (targetIds.length === 0) return false;
    const backlogCols = new Set(
      activeProject.columns.filter((c) => c.is_backlog).map((c) => c.id)
    );
    return targetIds.every((id) => {
      const task = allTasks.find((t) => t.id === id);
      return task ? backlogCols.has(task.column_id) : false;
    });
  }, [activeProject, allTasks, actionTargetIds, selectedTaskIds]);

  // Resolve the target ids the current bulk action should apply to.
  const resolveTargetIds = useCallback((): string[] => {
    if (actionTargetIds && actionTargetIds.length > 0) return actionTargetIds;
    return [...selectedTaskIds];
  }, [actionTargetIds, selectedTaskIds]);

  // Context menu handler — decides single vs multi based on whether the
  // right-clicked task is part of the active selection.
  const handleContextAction = useCallback(
    async (action: TaskContextAction, taskId: string) => {
      const ids = selectedTaskIds.has(taskId) ? [...selectedTaskIds] : [taskId];
      setActionTargetIds(ids);

      switch (action.type) {
        case "open": {
          const task = allTasks.find((t) => t.id === taskId);
          if (task) setSelectedTask(task);
          setActionTargetIds(null);
          break;
        }
        case "delete": {
          setBulkDeleteConfirmCount(ids.length);
          break;
        }
        case "moveToProject": {
          setShowMoveToProject(true);
          break;
        }
        case "moveToColumn": {
          const { moveTask } = usePmStore.getState();
          for (const id of ids) {
            const task = allTasks.find((t) => t.id === id);
            if (!task) continue;
            // Append to end of target column
            const targetCol = activeProject?.columns.find((c) => c.id === action.columnId);
            const position = targetCol?.tasks.length ?? 0;
            try {
              await moveTask(id, action.columnId, position);
            } catch (err) {
              logger.error("[PM] moveToColumn failed", err);
            }
          }
          setActionTargetIds(null);
          break;
        }
        case "setPriority": {
          const { updateTask } = usePmStore.getState();
          for (const id of ids) {
            try {
              await updateTask(id, { priority: action.priority });
            } catch (err) {
              logger.error("[PM] setPriority failed", err);
            }
          }
          setActionTargetIds(null);
          break;
        }
        case "assign": {
          // Single-task: route through TaskDetailPanel which has the user picker.
          // Bulk assign UX is v2 — for v1 we open the first selected task's panel.
          const first = allTasks.find((t) => t.id === ids[0]);
          if (first) setSelectedTask(first);
          setActionTargetIds(null);
          break;
        }
      }
    },
    [selectedTaskIds, allTasks, activeProject]
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = resolveTargetIds();
    if (ids.length === 0) return;
    try {
      if (actionTargetIds && actionTargetIds.length > 0 && !selectedTaskIds.has(actionTargetIds[0])) {
        // Single-item context path: call singular delete for just that id
        for (const id of ids) {
          await usePmStore.getState().deleteTask(id);
        }
      } else {
        await bulkDeleteSelectedTasks();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Try again";
      showErrorToast("Delete failed", message);
    } finally {
      setBulkDeleteConfirmCount(null);
      setActionTargetIds(null);
    }
  }, [resolveTargetIds, actionTargetIds, selectedTaskIds, bulkDeleteSelectedTasks]);

  const handleConfirmMoveToProject = useCallback(
    async (targetProjectId: string) => {
      const ids = resolveTargetIds();
      if (ids.length === 0) return;
      // If the operation is against the current selection, use the store's
      // thunk (re-fetches project on success). If single-item context, call
      // the API directly for just that id.
      if (actionTargetIds && actionTargetIds.length > 0 && !selectedTaskIds.has(actionTargetIds[0])) {
        const { bulkMoveTasksToProject } = await import("../../api/pm");
        await bulkMoveTasksToProject(ids, targetProjectId);
        if (activeProject) await fetchProject(activeProject.id);
      } else {
        await bulkMoveSelectedTasksToProject(targetProjectId);
      }
      setActionTargetIds(null);
    },
    [
      resolveTargetIds,
      actionTargetIds,
      selectedTaskIds,
      bulkMoveSelectedTasksToProject,
      fetchProject,
      activeProject,
    ]
  );

  if (isLoading && !activeProject) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: "var(--color-pm-bg-primary)" }}
      >
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D66853] border-t-transparent" />
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center text-center"
        style={{ backgroundColor: "var(--color-pm-bg-primary)" }}
      >
        <p style={{ color: "var(--color-pm-text-muted)" }}>Project not found</p>
      </div>
    );
  }

  const deadline = formatDeadline(activeProject.deadline);
  const totalTasks = activeProject.columns.reduce((acc, c) => acc + c.tasks.length, 0);
  const doneTasks = activeProject.columns
    .filter((c) => c.name === "Done")
    .reduce((acc, c) => acc + c.tasks.length, 0);
  const selectionCount = selectedTaskIds.size;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "var(--color-pm-bg-primary)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--color-pm-border-subtle)" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/admin/pm")}
            className="rounded-lg p-2 transition-colors duration-150"
            style={{ color: "var(--color-pm-text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-pm-bg-hover)";
              (e.currentTarget as HTMLElement).style.color = "var(--color-pm-text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--color-pm-text-muted)";
            }}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <div>
            <h1
              className="text-[18px] font-semibold"
              style={{ color: "var(--color-pm-text-primary)", letterSpacing: "-0.01em" }}
            >
              {activeProject.name}
            </h1>
            <div className="flex items-center gap-3 mt-0.5">
              {deadline && (
                <span className={`text-[12px] font-medium ${deadline.colorClass}`}>
                  Due {deadline.text}
                </span>
              )}
              {totalTasks > 0 && (
                <span
                  className="text-[12px]"
                  style={{ color: "var(--color-pm-text-muted)" }}
                >
                  {doneTasks}/{totalTasks} tasks done
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* AI Synth */}
          <button
            onClick={() => setShowAiSynth(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150"
            style={{
              backgroundColor: "var(--color-pm-accent-subtle2)",
              color: "#D66853",
            }}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
            AI Synth
          </button>

          {/* Focus Mode */}
          <button
            onClick={() => setFocusMode(true)}
            className="hidden md:flex rounded-lg p-2 transition-colors duration-150"
            style={{ color: "var(--color-pm-text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-pm-bg-hover)";
              (e.currentTarget as HTMLElement).style.color = "var(--color-pm-text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--color-pm-text-muted)";
            }}
            title="Focus Mode"
          >
            <Maximize className="h-4 w-4" strokeWidth={1.5} />
          </button>

          {/* Activity popover */}
          <div className="relative">
            <button
              onClick={() => setShowActivity(!showActivity)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150"
              style={{ color: showActivity ? "#D66853" : "var(--color-pm-text-muted)" }}
            >
              <Clock className="h-4 w-4" strokeWidth={1.5} />
              Activity
            </button>
            <AnimatePresence>
              {showActivity && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-30"
                    onClick={() => setShowActivity(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 z-40 w-[380px] max-h-[480px] overflow-y-auto rounded-xl"
                    style={{
                      backgroundColor: "var(--color-pm-bg-secondary)",
                      border: "1px solid var(--color-pm-border)",
                      boxShadow: "var(--pm-shadow-elevated)",
                    }}
                  >
                    <ActivityTimeline projectId={activeProject.id} />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Backlog toggle */}
          <button
            onClick={() => setShowBacklog(!showBacklog)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150"
            style={{ color: "var(--color-pm-text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-pm-bg-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            {showBacklog ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.5} />
            )}
            Backlog
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="rounded-lg p-2 transition-colors duration-150"
              style={{ color: "var(--color-pm-text-muted)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-pm-bg-hover)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              }}
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1 z-30 w-44 rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: "var(--color-pm-bg-tertiary)",
                    border: "1px solid var(--color-pm-border)",
                    boxShadow: "var(--pm-shadow-elevated)",
                  }}
                >
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleArchive();
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors duration-150"
                    style={{ color: "var(--color-pm-text-secondary)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-pm-bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <Archive className="h-4 w-4" strokeWidth={1.5} />
                    Archive
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#C43333] transition-colors duration-150"
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(196,51,51,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden px-5 pt-5">
        <KanbanBoard
          project={activeProject}
          onTaskClick={setSelectedTask}
          onDeleteTask={handleDeleteTask}
          showBacklog={showBacklog}
          selectedTaskIds={selectedTaskIds}
          selectionActive={selectionCount > 0}
          onToggleSelect={toggleTaskSelection}
          onContextAction={handleContextAction}
        />
      </div>

      {/* Task Detail Panel */}
      <TaskDetailPanel
        task={selectedTask}
        onClose={handleCloseTaskPanel}
        initialTab={
          selectedTask?.id === requestedTaskId ? requestedTab : undefined
        }
        isBacklog={
          selectedTask
            ? activeProject.columns.find((c) => c.id === selectedTask.column_id)?.is_backlog ?? false
            : false
        }
      />

      {/* Bulk Action Bar */}
      {selectionCount > 0 && (
        <BulkActionBar
          selectedCount={selectionCount}
          totalCount={totalTasks}
          onClear={clearTaskSelection}
          actions={[
            {
              label: "Move to project",
              icon: <ArrowRight className="h-4 w-4" />,
              variant: "primary" as const,
              disabled: !allTargetsInBacklog,
              onClick: () => {
                setActionTargetIds(null); // use selection
                setShowMoveToProject(true);
              },
            },
            {
              label: "Delete",
              icon: <Trash2 className="h-4 w-4" />,
              variant: "danger" as const,
              onClick: () => {
                setActionTargetIds(null);
                setBulkDeleteConfirmCount(selectionCount);
              },
            },
          ]}
        />
      )}

      {/* Move to Project modal */}
      <MoveToProjectModal
        isOpen={showMoveToProject}
        onClose={() => {
          setShowMoveToProject(false);
          setActionTargetIds(null);
        }}
        taskCount={
          actionTargetIds && actionTargetIds.length > 0
            ? actionTargetIds.length
            : selectionCount
        }
        currentProjectId={activeProject.id}
        onConfirm={handleConfirmMoveToProject}
      />

      {/* Bulk delete confirm */}
      <AnimatePresence>
        {bulkDeleteConfirmCount !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setBulkDeleteConfirmCount(null);
                setActionTargetIds(null);
              }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl p-6"
              style={{
                backgroundColor: "var(--color-pm-bg-secondary)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
                border: "1px solid var(--color-pm-border)",
              }}
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl mb-4 mx-auto"
                style={{ backgroundColor: "rgba(196,51,51,0.1)" }}
              >
                <Trash2 className="h-6 w-6 text-[#C43333]" strokeWidth={1.5} />
              </div>
              <h3
                className="text-[16px] font-semibold text-center mb-1"
                style={{ color: "var(--color-pm-text-primary)" }}
              >
                Delete {bulkDeleteConfirmCount} task
                {bulkDeleteConfirmCount !== 1 ? "s" : ""}?
              </h3>
              <p
                className="text-[13px] text-center mb-5"
                style={{ color: "var(--color-pm-text-secondary)" }}
              >
                This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setBulkDeleteConfirmCount(null);
                    setActionTargetIds(null);
                  }}
                  className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold"
                  style={{
                    border: "1px solid var(--color-pm-border)",
                    color: "var(--color-pm-text-secondary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white"
                  style={{ backgroundColor: "#C43333" }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* AI Synth Modal */}
      <AISynthModal
        isOpen={showAiSynth}
        onClose={() => setShowAiSynth(false)}
        projectId={activeProject.id}
      />

      {/* Focus Mode */}
      <FocusMode
        isActive={focusMode}
        onExit={() => setFocusMode(false)}
        project={activeProject}
        onTaskClick={setSelectedTask}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onToggleFocusMode={() => setFocusMode((v) => !v)}
      />

      {/* Floating Clock */}
      <div className="fixed bottom-6 right-24 z-30">
        <FloatingClock />
      </div>

      {/* FAB — New Task */}
      <div className="fixed bottom-6 right-6 z-30">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreateTask(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: "#D66853", boxShadow: "var(--pm-shadow-fab)" }}
        >
          <Plus className="h-6 w-6" strokeWidth={2} />
        </motion.button>
      </div>

      <CreateTaskModal isOpen={showCreateTask} onClose={() => setShowCreateTask(false)} preselectedProjectId={activeProject.id} />

      {/* Global celebration overlay */}
      <CompletionCelebration />

      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl p-6"
              style={{
                backgroundColor: "var(--color-pm-bg-secondary)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
                border: "1px solid var(--color-pm-border)",
              }}
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl mb-4 mx-auto"
                style={{ backgroundColor: "rgba(196,51,51,0.1)" }}
              >
                <Trash2 className="h-6 w-6 text-[#C43333]" strokeWidth={1.5} />
              </div>
              <h3
                className="text-[16px] font-semibold text-center mb-1"
                style={{ color: "var(--color-pm-text-primary)" }}
              >
                Delete {activeProject.name}?
              </h3>
              <p
                className="text-[13px] text-center mb-5"
                style={{ color: "var(--color-pm-text-secondary)" }}
              >
                This will permanently delete all tasks and activity.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-colors duration-150"
                  style={{
                    border: "1px solid var(--color-pm-border)",
                    color: "var(--color-pm-text-secondary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    handleDelete();
                  }}
                  className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white transition-colors duration-150"
                  style={{ backgroundColor: "#C43333" }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
