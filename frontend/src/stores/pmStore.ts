import { create } from "zustand";
import type {
  PmProject,
  PmProjectDetail,
  PmTask,

  CreateProjectInput,
  CreateTaskInput,
} from "../types/pm";
import * as pmApi from "../api/pm";
import { logger } from "../lib/logger";

interface PmState {
  projects: PmProject[];
  activeProject: PmProjectDetail | null;
  isLoading: boolean;

  // Multi-select state (project board, scoped to activeProject)
  selectedTaskIds: Set<string>;
  // Multi-select state (Me tab, spans projects)
  meSelectedTaskIds: Set<string>;

  // Project actions
  fetchProjects: (status?: string) => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (data: CreateProjectInput) => Promise<PmProject>;
  updateProject: (id: string, data: Partial<PmProject>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;

  // Task actions
  createTask: (projectId: string, data: CreateTaskInput) => Promise<void>;
  updateTask: (taskId: string, data: Partial<PmTask>) => Promise<void>;
  moveTask: (taskId: string, columnId: string, position: number, rollbackSnapshot?: PmProjectDetail | null) => Promise<void>;
  assignTask: (taskId: string, userId: number | null) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  // Optimistic helpers
  optimisticMoveTask: (
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
    position: number
  ) => PmProjectDetail | null;

  // Multi-select (project board)
  toggleTaskSelection: (id: string) => void;
  clearTaskSelection: () => void;
  selectTaskIds: (ids: string[]) => void;
  bulkDeleteSelectedTasks: () => Promise<void>;
  bulkMoveSelectedTasksToProject: (targetProjectId: string) => Promise<void>;

  // Multi-select (Me tab)
  toggleMeTaskSelection: (id: string) => void;
  clearMeTaskSelection: () => void;
  bulkDeleteMeSelectedTasks: () => Promise<void>;
}

export const usePmStore = create<PmState>((set, get) => ({
  projects: [],
  activeProject: null,
  isLoading: false,
  selectedTaskIds: new Set<string>(),
  meSelectedTaskIds: new Set<string>(),

  fetchProjects: async (status = "active") => {
    set({ isLoading: true });
    try {
      const projects = await pmApi.fetchProjects(status);
      set({ projects, isLoading: false });
    } catch (err) {
      logger.error("[PM] fetchProjects failed:", err);
      set({ projects: [], isLoading: false });
    }
  },

  fetchProject: async (id: string) => {
    set({ isLoading: true });
    try {
      const project = await pmApi.fetchProject(id);
      // Clear selection when switching projects so stale ids don't linger.
      const current = get().activeProject;
      const clearSelection = current?.id !== id;
      set({
        activeProject: project,
        isLoading: false,
        ...(clearSelection ? { selectedTaskIds: new Set<string>() } : {}),
      });
    } catch (err) {
      logger.error("[PM] fetchProject failed:", err);
      set({ isLoading: false });
    }
  },

  createProject: async (data: CreateProjectInput) => {
    const project = await pmApi.createProject(data);
    // Re-fetch to get computed fields (total_tasks, effective_deadline, etc.)
    get().fetchProjects();
    return project;
  },

  updateProject: async (id: string, data: Partial<PmProject>) => {
    const updated = await pmApi.updateProject(id, data);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updated } : p)),
      activeProject:
        state.activeProject?.id === id
          ? { ...state.activeProject, ...updated }
          : state.activeProject,
    }));
  },

  deleteProject: async (id: string) => {
    await pmApi.deleteProject(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProject: state.activeProject?.id === id ? null : state.activeProject,
    }));
  },

  archiveProject: async (id: string) => {
    const updated = await pmApi.archiveProject(id);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updated } : p)),
    }));
  },

  createTask: async (projectId: string, data: CreateTaskInput) => {
    const task = await pmApi.createTask(projectId, data);
    set((state) => {
      if (!state.activeProject || state.activeProject.id !== projectId) return state;
      const columns = state.activeProject.columns.map((col) => {
        if (col.id !== data.column_id) return col;
        // Insert at position 0, shift others
        const shifted = col.tasks.map((t) => ({ ...t, position: t.position + 1 }));
        return { ...col, tasks: [task, ...shifted] };
      });
      return { activeProject: { ...state.activeProject, columns } };
    });
  },

  updateTask: async (taskId: string, data: Partial<PmTask>) => {
    const updated = await pmApi.updateTask(taskId, data);
    set((state) => {
      if (!state.activeProject) return state;
      const columns = state.activeProject.columns.map((col) => ({
        ...col,
        tasks: col.tasks.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
      }));
      return { activeProject: { ...state.activeProject, columns } };
    });
  },

  moveTask: async (taskId: string, columnId: string, position: number, rollbackSnapshot?: PmProjectDetail | null) => {
    // If a pre-drag snapshot was provided (from handleDragOver flow), use it for rollback.
    // Otherwise, save the current state and do the optimistic move here (non-drag callers).
    const snapshot = rollbackSnapshot !== undefined ? rollbackSnapshot : get().activeProject;

    if (rollbackSnapshot === undefined) {
      // Called outside drag flow — do optimistic update
      const task = snapshot?.columns
        .flatMap((c) => c.tasks)
        .find((t) => t.id === taskId);
      if (task) {
        get().optimisticMoveTask(taskId, task.column_id, columnId, position);
      }
    }

    try {
      await pmApi.moveTask(taskId, columnId, position);
      // Re-fetch only if moving to/from Backlog (priority changes server-side)
      const fromBacklog =
        snapshot?.columns.find((c) => c.tasks.some((t) => t.id === taskId))?.is_backlog ?? false;
      const toBacklog = snapshot?.columns.find((c) => c.id === columnId)?.is_backlog ?? false;
      if ((fromBacklog || toBacklog) && snapshot?.id) {
        const fresh = await pmApi.fetchProject(snapshot.id);
        set({ activeProject: fresh });
      }
    } catch {
      set({ activeProject: snapshot });
    }
  },

  assignTask: async (taskId: string, userId: number | null) => {
    const updated = await pmApi.assignTask(taskId, userId);
    set((state) => {
      if (!state.activeProject) return state;
      const columns = state.activeProject.columns.map((col) => ({
        ...col,
        tasks: col.tasks.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
      }));
      return { activeProject: { ...state.activeProject, columns } };
    });
  },

  deleteTask: async (taskId: string) => {
    await pmApi.deleteTask(taskId);
    set((state) => {
      if (!state.activeProject) return state;
      const columns = state.activeProject.columns.map((col) => ({
        ...col,
        tasks: col.tasks
          .filter((t) => t.id !== taskId)
          .map((t, i) => ({ ...t, position: i })),
      }));
      return { activeProject: { ...state.activeProject, columns } };
    });
  },

  optimisticMoveTask: (
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
    targetPosition: number
  ) => {
    const state = get();
    if (!state.activeProject) return null;

    const columns = state.activeProject.columns.map((col) => {
      if (col.id === fromColumnId && fromColumnId === toColumnId) {
        // Same column reorder
        const task = col.tasks.find((t) => t.id === taskId);
        if (!task) return col;
        const filtered = col.tasks.filter((t) => t.id !== taskId);
        filtered.splice(targetPosition, 0, {
          ...task,
          position: targetPosition,
          column_id: toColumnId,
        });
        return {
          ...col,
          tasks: filtered.map((t, i) => ({ ...t, position: i })),
        };
      }

      if (col.id === fromColumnId) {
        // Remove from source
        return {
          ...col,
          tasks: col.tasks
            .filter((t) => t.id !== taskId)
            .map((t, i) => ({ ...t, position: i })),
        };
      }

      if (col.id === toColumnId) {
        // Add to target
        const task = state.activeProject!.columns
          .flatMap((c) => c.tasks)
          .find((t) => t.id === taskId);
        if (!task) return col;

        const tasks = [...col.tasks];
        tasks.splice(targetPosition, 0, {
          ...task,
          column_id: toColumnId,
          position: targetPosition,
          completed_at: col.name === "Done" ? new Date().toISOString() : null,
        });
        return {
          ...col,
          tasks: tasks.map((t, i) => ({ ...t, position: i })),
        };
      }

      return col;
    });

    const updated = { ...state.activeProject, columns };
    set({ activeProject: updated });
    return updated;
  },

  // --- Multi-select (project board) ---

  toggleTaskSelection: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedTaskIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedTaskIds: next };
    });
  },

  clearTaskSelection: () => {
    set({ selectedTaskIds: new Set<string>() });
  },

  selectTaskIds: (ids: string[]) => {
    set({ selectedTaskIds: new Set(ids) });
  },

  bulkDeleteSelectedTasks: async () => {
    const state = get();
    const ids = [...state.selectedTaskIds];
    if (ids.length === 0) return;
    const snapshot = state.activeProject;

    // Optimistic remove
    set((s) => {
      if (!s.activeProject) return s;
      const columns = s.activeProject.columns.map((col) => ({
        ...col,
        tasks: col.tasks
          .filter((t) => !state.selectedTaskIds.has(t.id))
          .map((t, i) => ({ ...t, position: i })),
      }));
      return {
        activeProject: { ...s.activeProject, columns },
        selectedTaskIds: new Set<string>(),
      };
    });

    try {
      await pmApi.bulkDeleteTasks(ids);
    } catch (err) {
      logger.error("[PM] bulkDeleteTasks failed:", err);
      set({ activeProject: snapshot, selectedTaskIds: new Set(ids) });
      throw err;
    }
  },

  bulkMoveSelectedTasksToProject: async (targetProjectId: string) => {
    const state = get();
    const ids = [...state.selectedTaskIds];
    if (ids.length === 0) return;

    // Validate: all selected tasks are in a backlog column of the active project.
    // Enforced server-side as well; client check avoids a bad API call.
    const active = state.activeProject;
    if (!active) return;
    const backlogColumnIds = new Set(
      active.columns.filter((c) => c.is_backlog).map((c) => c.id)
    );
    const selectedTasks = active.columns.flatMap((c) => c.tasks).filter((t) => state.selectedTaskIds.has(t.id));
    if (!selectedTasks.every((t) => backlogColumnIds.has(t.column_id))) {
      throw new Error("Only backlog items can be moved between projects");
    }

    try {
      await pmApi.bulkMoveTasksToProject(ids, targetProjectId);
      // Positions shift on both sides; re-fetch source project to resync.
      await get().fetchProject(active.id);
      set({ selectedTaskIds: new Set<string>() });
    } catch (err) {
      logger.error("[PM] bulkMoveTasksToProject failed:", err);
      throw err;
    }
  },

  // --- Multi-select (Me tab) ---

  toggleMeTaskSelection: (id: string) => {
    set((state) => {
      const next = new Set(state.meSelectedTaskIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { meSelectedTaskIds: next };
    });
  },

  clearMeTaskSelection: () => {
    set({ meSelectedTaskIds: new Set<string>() });
  },

  bulkDeleteMeSelectedTasks: async () => {
    const state = get();
    const ids = [...state.meSelectedTaskIds];
    if (ids.length === 0) return;
    try {
      await pmApi.bulkDeleteTasks(ids);
      set({ meSelectedTaskIds: new Set<string>() });
    } catch (err) {
      logger.error("[PM] bulkDeleteMeSelectedTasks failed:", err);
      throw err;
    }
  },
}));
