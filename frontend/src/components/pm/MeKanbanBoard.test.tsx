import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../test/test-utils";
import type { PmMyTasksResponse } from "../../types/pm";
import { MeKanbanBoard } from "./MeKanbanBoard";

const pmStoreMock = vi.hoisted(() => {
  const state = {
    moveTask: vi.fn(),
  };
  const usePmStore = vi.fn((selector: (store: typeof state) => unknown) => selector(state));
  return { state, usePmStore };
});

vi.mock("../../stores/pmStore", () => ({
  usePmStore: pmStoreMock.usePmStore,
}));

const emptyTasks: PmMyTasksResponse = {
  todo: [],
  in_progress: [],
  done: [],
};

describe("MeKanbanBoard", () => {
  beforeEach(() => {
    pmStoreMock.state.moveTask.mockResolvedValue(undefined);
  });

  it("shows add controls for To Do and In Progress only", async () => {
    const user = userEvent.setup();
    const onAddTask = vi.fn();

    renderWithProviders(
      <MeKanbanBoard
        tasks={emptyTasks}
        onRefresh={vi.fn()}
        onAddTask={onAddTask}
      />,
    );

    expect(screen.getByRole("button", { name: /add task to to do/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add task to in progress/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add task to done/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add task to to do/i }));

    expect(onAddTask).toHaveBeenCalledWith("todo");
  });
});
