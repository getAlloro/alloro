import { useState, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { usePmStore } from "../../stores/pmStore";
import type { PmMyTask, PmMyTasksResponse } from "../../types/pm";
import { MeTaskCard } from "./MeTaskCard";
import type { TaskContextAction } from "./TaskCard";
import { DoneWeekGroups } from "./DoneWeekGroups";

interface MeKanbanBoardProps {
  tasks: PmMyTasksResponse;
  onRefresh: () => void;
  highlightedTaskId?: string | null;
  onCardClick?: (task: PmMyTask) => void;
  selectedTaskIds?: Set<string>;
  selectionActive?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onContextAction?: (action: TaskContextAction, taskId: string) => void;
}

const COLUMNS: { key: keyof PmMyTasksResponse; label: string }[] = [
  { key: "todo", label: "TO DO" },
  { key: "in_progress", label: "IN PROGRESS" },
  { key: "done", label: "DONE" },
];

// ── Droppable column ──────────────────────────────────────────────────────────
function DroppableColumn({
  columnKey,
  label,
  tasks,
  highlightedTaskId,
  isDraggingOver,
  onCardClick,
  selectedTaskIds,
  selectionActive,
  onToggleSelect,
  onContextAction,
}: {
  columnKey: keyof PmMyTasksResponse;
  label: string;
  tasks: PmMyTask[];
  highlightedTaskId?: string | null;
  isDraggingOver: boolean;
  onCardClick?: (task: PmMyTask) => void;
  selectedTaskIds?: Set<string>;
  selectionActive?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onContextAction?: (action: TaskContextAction, taskId: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: columnKey });
  const isDone = columnKey === "done";
  const emptyState = (
    <p className="text-center text-[11px] py-6" style={{ color: "var(--color-pm-text-muted)" }}>
      —
    </p>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-wider" style={{ color: "var(--color-pm-text-muted)" }}>
          {label}
        </span>
        <span className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className="min-h-[120px] rounded-xl p-2 transition-all duration-150"
        style={{
          backgroundColor: isDraggingOver ? "var(--color-pm-bg-hover)" : "var(--color-pm-bg-secondary)",
          border: isDraggingOver ? "2px solid rgba(214,104,83,0.5)" : "2px solid transparent",
          transform: isDraggingOver ? "scale(1.01)" : "scale(1)",
        }}
      >
        {isDone ? (
          <DoneWeekGroups
            tasks={tasks}
            emptyState={emptyState}
            renderTask={(task) => (
              <DraggableCard
                key={task.id}
                task={task}
                isHighlighted={highlightedTaskId === task.id}
                onCardClick={onCardClick}
                isSelected={selectedTaskIds?.has(task.id) ?? false}
                selectionActive={selectionActive ?? false}
                onToggleSelect={onToggleSelect}
                onContextAction={onContextAction}
              />
            )}
          />
        ) : tasks.length === 0 ? (
          emptyState
        ) : (
          tasks.map((task) => (
            <DraggableCard
              key={task.id}
              task={task}
              isHighlighted={highlightedTaskId === task.id}
              onCardClick={onCardClick}
              isSelected={selectedTaskIds?.has(task.id) ?? false}
              selectionActive={selectionActive ?? false}
              onToggleSelect={onToggleSelect}
              onContextAction={onContextAction}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Draggable card ────────────────────────────────────────────────────────────
function DraggableCard({
  task,
  isHighlighted,
  onCardClick,
  isSelected,
  selectionActive,
  onToggleSelect,
  onContextAction,
}: {
  task: PmMyTask;
  isHighlighted: boolean;
  onCardClick?: (task: PmMyTask) => void;
  isSelected?: boolean;
  selectionActive?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onContextAction?: (action: TaskContextAction, taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  const didDrag = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none",
    userSelect: "none" as const,
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    didDrag.current = false;
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx > 5 || dy > 5) didDrag.current = true;
  };

  const handleClick = () => {
    if (!didDrag.current && onCardClick) onCardClick(task);
    didDrag.current = false;
    pointerStart.current = null;
  };

  return (
    <div
      ref={setNodeRef}
      id={`me-task-${task.id}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
      {...listeners}
      {...attributes}
    >
      <MeTaskCard
        task={task}
        isHighlighted={isHighlighted}
        isSelected={isSelected}
        selectionActive={selectionActive}
        onToggleSelect={onToggleSelect}
        onContextAction={onContextAction}
      />
    </div>
  );
}

// Only consider the 3 column droppables for collision — more reliable than pointerWithin for edge columns
const columnOnlyCollision: CollisionDetection = (args) => {
  const columnKeys = new Set<string>(COLUMNS.map((c) => c.key));
  const columnContainers = args.droppableContainers.filter((c) => columnKeys.has(c.id as string));
  return rectIntersection({ ...args, droppableContainers: columnContainers });
};

// ── Board ─────────────────────────────────────────────────────────────────────
export function MeKanbanBoard({
  tasks,
  onRefresh,
  highlightedTaskId,
  onCardClick,
  selectedTaskIds,
  selectionActive,
  onToggleSelect,
  onContextAction,
}: MeKanbanBoardProps) {
  const moveTask = usePmStore((s) => s.moveTask);
  const [localTasks, setLocalTasks] = useState<PmMyTasksResponse>(tasks);
  const [activeTask, setActiveTask] = useState<PmMyTask | null>(null);
  const [overColumn, setOverColumn] = useState<keyof PmMyTasksResponse | null>(null);

  // Sync local state when parent refresh resolves
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(event.active.data.current?.task as PmMyTask);
  };

  const handleDragOver = (event: { over: { id: unknown } | null }) => {
    const overId = event.over?.id as keyof PmMyTasksResponse | null;
    setOverColumn(overId && COLUMNS.some((c) => c.key === overId) ? overId : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const task = event.active.data.current?.task as PmMyTask | undefined;
    const targetKey = event.over?.id as keyof PmMyTasksResponse | undefined;

    setActiveTask(null);
    setOverColumn(null);

    if (!task || !targetKey) return;
    if (!COLUMNS.some((c) => c.key === targetKey)) return;

    const { todo_id, in_progress_id, done_id } = task.project_column_ids;
    const colMap: Record<keyof PmMyTasksResponse, string> = {
      todo: todo_id,
      in_progress: in_progress_id,
      done: done_id,
    };
    const targetColId = colMap[targetKey];
    if (!targetColId || task.column_id === targetColId) return;

    // Optimistic update — move card immediately in local state
    const updatedTask: PmMyTask = {
      ...task,
      column_id: targetColId,
      completed_at:
        targetKey === "done" ? task.completed_at ?? new Date().toISOString() : null,
    };
    setLocalTasks((prev) => {
      const sourceKey = COLUMNS.find((c) => c.key !== targetKey && prev[c.key].some((t) => t.id === task.id))?.key;
      if (!sourceKey) return prev;
      return {
        ...prev,
        [sourceKey]: prev[sourceKey].filter((t) => t.id !== task.id),
        [targetKey]: [...prev[targetKey], updatedTask],
      };
    });

    // Persist in background
    const position = localTasks[targetKey].length;
    moveTask(task.id, targetColId, position).then(onRefresh);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={columnOnlyCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map(({ key, label }) => (
          <DroppableColumn
            key={key}
            columnKey={key}
            label={label}
            tasks={localTasks[key]}
            highlightedTaskId={highlightedTaskId}
            isDraggingOver={overColumn === key}
            onCardClick={onCardClick}
            selectedTaskIds={selectedTaskIds}
            selectionActive={selectionActive}
            onToggleSelect={onToggleSelect}
            onContextAction={onContextAction}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <div style={{ opacity: 0.9, cursor: "grabbing" }}>
            <MeTaskCard task={activeTask} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
