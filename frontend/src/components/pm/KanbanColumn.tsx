import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { motion } from "framer-motion";
import type { PmColumn, PmTask } from "../../types/pm";
import { TaskCard } from "./TaskCard";
import type { TaskContextAction } from "./TaskCard";
import { QuickAddTask } from "./QuickAddTask";
import { NoTasksInColumn } from "./EmptyStates";
import { DoneWeekGroups } from "./DoneWeekGroups";

const COLUMN_ACCENTS: Record<string, string> = {
  "Backlog": "var(--color-pm-text-muted)",
  "To Do": "#D4920A",
  "In Progress": "#D66853",
  "Done": "#3D8B40",
};

interface KanbanColumnProps {
  column: PmColumn;
  projectId: string;
  onTaskClick: (task: PmTask) => void;
  onDeleteTask?: (taskId: string) => void;
  // Multi-select props — passed down from ProjectBoard
  selectedTaskIds?: Set<string>;
  selectionActive?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onContextAction?: (action: TaskContextAction, taskId: string) => void;
  siblingColumns?: PmColumn[];
}

export function KanbanColumn({
  column,
  projectId,
  onTaskClick,
  onDeleteTask,
  selectedTaskIds,
  selectionActive = false,
  onToggleSelect,
  onContextAction,
  siblingColumns,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const accent = COLUMN_ACCENTS[column.name] || "var(--color-pm-text-muted)";
  const isBacklog = column.is_backlog;
  const isDone = column.name === "Done";

  return (
    <div
      className="flex flex-col rounded-xl min-w-[280px] w-[280px] flex-shrink-0"
      style={{ backgroundColor: "var(--color-pm-bg-secondary)" }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div
          className="h-2 w-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: accent }}
        />
        <h3
          className="text-[12px] font-semibold uppercase tracking-[0.05em]"
          style={{ color: "var(--color-pm-text-secondary)" }}
        >
          {column.name}
        </h3>
        <motion.span
          key={column.tasks.length}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold"
          style={{
            backgroundColor: "var(--color-pm-accent-subtle)",
            color: "#D66853",
          }}
        >
          {column.tasks.length}
        </motion.span>
      </div>

      {/* Quick add */}
      <QuickAddTask projectId={projectId} columnId={column.id} isBacklog={isBacklog} />

      {/* Task list */}
      <div
        ref={setNodeRef}
        className="flex-1 space-y-2 overflow-y-auto px-3 pb-3 transition-colors duration-150"
        style={{
          minHeight: 80,
          backgroundColor: isOver ? "var(--color-pm-accent-subtle)" : "transparent",
          borderRadius: "0 0 12px 12px",
        }}
      >
        <SortableContext
          items={column.tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {isDone ? (
            <DoneWeekGroups
              tasks={column.tasks}
              emptyState={!isOver ? <NoTasksInColumn /> : null}
              renderTask={(task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => onTaskClick(task)}
                  onDelete={onDeleteTask}
                  isBacklog={isBacklog}
                  isSelected={selectedTaskIds?.has(task.id) ?? false}
                  selectionActive={selectionActive}
                  onToggleSelect={onToggleSelect}
                  onContextAction={onContextAction}
                  siblingColumns={siblingColumns}
                />
              )}
            />
          ) : (
            <>
              {column.tasks.length === 0 && !isOver && <NoTasksInColumn />}
              {column.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => onTaskClick(task)}
                  onDelete={onDeleteTask}
                  isBacklog={isBacklog}
                  isSelected={selectedTaskIds?.has(task.id) ?? false}
                  selectionActive={selectionActive}
                  onToggleSelect={onToggleSelect}
                  onContextAction={onContextAction}
                  siblingColumns={siblingColumns}
                />
              ))}
            </>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
