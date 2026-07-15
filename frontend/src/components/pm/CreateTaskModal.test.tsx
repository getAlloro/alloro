import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProject, fetchProjects } from "../../api/pm";
import { renderWithProviders, screen, waitFor } from "../../test/test-utils";
import type { PmProjectDetail } from "../../types/pm";
import { CreateTaskModal } from "./CreateTaskModal";

const pmStoreMock = vi.hoisted(() => {
  const state = {
    activeProject: null as { id: string } | null,
    createTask: vi.fn(),
    fetchProject: vi.fn(),
  };
  const usePmStore = Object.assign(
    vi.fn((selector: (store: typeof state) => unknown) => selector(state)),
    { getState: vi.fn(() => state) },
  );
  return { state, usePmStore };
});

vi.mock("../../stores/pmStore", () => ({
  usePmStore: pmStoreMock.usePmStore,
}));

vi.mock("../../api/pm", () => ({
  fetchProjects: vi.fn(),
  fetchProject: vi.fn(),
}));

const project: PmProjectDetail = {
  id: "project-1",
  name: "Alloro",
  description: null,
  color: "#D66853",
  icon: "leaf",
  deadline: null,
  status: "active",
  created_by: 1,
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T00:00:00.000Z",
  columns: [
    {
      id: "col-todo",
      project_id: "project-1",
      name: "To Do",
      position: 1,
      is_hidden: false,
      is_backlog: false,
      tasks: [],
    },
    {
      id: "col-progress",
      project_id: "project-1",
      name: "In Progress",
      position: 2,
      is_hidden: false,
      is_backlog: false,
      tasks: [],
    },
  ],
};

describe("CreateTaskModal", () => {
  beforeEach(() => {
    vi.mocked(fetchProjects).mockResolvedValue([project]);
    vi.mocked(fetchProject).mockResolvedValue(project);
    pmStoreMock.state.activeProject = null;
    pmStoreMock.state.createTask.mockResolvedValue(undefined);
    pmStoreMock.state.fetchProject.mockResolvedValue(undefined);
  });

  it("keeps submit disabled until a project is explicitly selected when required", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateTaskModal
        isOpen
        onClose={vi.fn()}
        lockedColumnName="To Do"
        requireProjectSelection
        requiredAssigneeId={42}
      />,
    );

    await screen.findByRole("option", { name: "Alloro" });
    await user.type(screen.getByLabelText(/title/i), "Add rankings cleanup");

    expect(screen.getByRole("button", { name: /^Create Task$/i })).toBeDisabled();
    expect(pmStoreMock.state.createTask).not.toHaveBeenCalled();
  });

  it("creates the task in the locked column with the required assignee attached", async () => {
    const user = userEvent.setup();
    const callOrder: string[] = [];
    const onClose = vi.fn(() => callOrder.push("close"));
    const onCreated = vi.fn(() => callOrder.push("created"));
    renderWithProviders(
      <CreateTaskModal
        isOpen
        onClose={onClose}
        lockedColumnName="In Progress"
        requireProjectSelection
        requiredAssigneeId={77}
        onCreated={onCreated}
      />,
    );

    await screen.findByRole("option", { name: "Alloro" });
    await user.type(screen.getByLabelText(/title/i), "Build project picker");
    await user.selectOptions(screen.getByLabelText(/project/i), "project-1");
    await screen.findByText("In Progress");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Create Task$/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /^Create Task$/i }));

    await waitFor(() => {
      expect(pmStoreMock.state.createTask).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          title: "Build project picker",
          column_id: "col-progress",
          assigned_to: 77,
        }),
      );
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["close", "created"]);
  });
});
