/**
 * Frontend tests — OS comments (plans/07042026-alloro-os-admin-port P7 T2).
 * Two focused checks per the phase's FE harness:
 *   1. OsCommentComposer: Cmd/Ctrl+Enter fires onSubmit with the trimmed body,
 *      and an empty/whitespace body is blocked.
 *   2. OsCommentThread: renders roots + one reply level, blanks a tombstone as
 *      "Comment deleted", and shows the empty state + composer with no data.
 * The comments query hook and useAuth are mocked so nothing hits the network.
 * There are ZERO task affordances in the rendered output (asserted below).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/test-utils";
import type { OsCommentThreadView } from "../../../../api/admin-os";
import { OsCommentComposer } from "./OsCommentComposer";

// The thread's data + mutation hooks — mocked so no request fires.
const mutate = vi.fn();
const useAdminOsComments = vi.fn();
vi.mock("../../../../hooks/queries/useAdminOsComments", () => ({
  useAdminOsComments: () => useAdminOsComments(),
  useCreateOsComment: () => ({ mutate, isPending: false }),
  useEditOsComment: () => ({ mutate, isPending: false }),
  useDeleteOsComment: () => ({ mutate, isPending: false }),
}));

// The viewer identity — a fixed super-admin email.
vi.mock("../../../../hooks/useAuth", () => ({
  useAuth: () => ({ userProfile: { email: "me@test.alloro" } }),
}));

import { OsCommentThread } from "./OsCommentThread";

const view = (over: Partial<OsCommentThreadView> = {}): OsCommentThreadView => ({
  liveVersionNo: 3,
  comments: [],
  ...over,
});

const author = (email: string) => ({ id: 1, name: null, email });

const comment = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  parent_comment_id: null,
  author: author("me@test.alloro"),
  body_md: "root body",
  version_tag: 3,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted: false,
  replies: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  useAdminOsComments.mockReturnValue({
    data: view(),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe("OsCommentComposer", () => {
  it("submits the trimmed body on Cmd/Ctrl+Enter", () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <OsCommentComposer onSubmit={onSubmit} isSubmitting={false} />,
    );
    const textarea = screen.getByLabelText("Comment");
    fireEvent.change(textarea, { target: { value: "  hello  " } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledWith("hello");
  });

  it("does not submit an empty/whitespace body", () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <OsCommentComposer onSubmit={onSubmit} isSubmitting={false} />,
    );
    const textarea = screen.getByLabelText("Comment");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("OsCommentThread", () => {
  it("shows the empty state and a composer when there are no comments", () => {
    renderWithProviders(<OsCommentThread documentId="doc-1" />);
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    expect(screen.getByLabelText("Comment")).toBeInTheDocument();
  });

  it("renders roots with one reply level", () => {
    useAdminOsComments.mockReturnValue({
      data: view({
        comments: [
          comment({
            id: "root",
            body_md: "the root comment",
            replies: [comment({ id: "reply", body_md: "the reply", parent_comment_id: "root" })],
          }),
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<OsCommentThread documentId="doc-1" />);
    expect(screen.getByText("the root comment")).toBeInTheDocument();
    expect(screen.getByText("the reply")).toBeInTheDocument();
  });

  it("renders a tombstone as 'Comment deleted' keeping its slot", () => {
    useAdminOsComments.mockReturnValue({
      data: view({
        comments: [comment({ id: "gone", deleted: true, body_md: "", replies: [] })],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<OsCommentThread documentId="doc-1" />);
    expect(screen.getByText("Comment deleted")).toBeInTheDocument();
  });

  it("has no task affordances (no resolve/assignee/due controls)", () => {
    useAdminOsComments.mockReturnValue({
      data: view({ comments: [comment({ id: "root", replies: [] })] }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<OsCommentThread documentId="doc-1" />);
    // None of the task-shaped controls the port deliberately dropped exist.
    expect(screen.queryByText(/resolve/i)).toBeNull();
    expect(screen.queryByText(/assignee/i)).toBeNull();
    expect(screen.queryByText(/due date/i)).toBeNull();
    expect(screen.queryByLabelText(/mark as task/i)).toBeNull();
  });
});
