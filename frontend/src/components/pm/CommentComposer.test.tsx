import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "../../test/test-utils";
import { CommentComposer } from "./CommentComposer";

const users = [
  { id: 2, display_name: "Alex", email: "alex@getalloro.com" },
];

describe("CommentComposer", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:comment-image"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  it("submits selected mentions and image files", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const image = new File(["image"], "screenshot.png", { type: "image/png" });
    renderWithProviders(
      <CommentComposer
        allowImages
        users={users}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText("Type @ to mention an admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comment" })).toBeDisabled();

    await user.type(screen.getByLabelText("Comment"), "@Al");
    await user.click(screen.getByRole("button", { name: /Alex/i }));
    expect(screen.getByRole("button", { name: "@Alex" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose comment images"), {
      target: { files: [image] },
    });
    expect(screen.getByRole("img", { name: "screenshot.png" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.stringContaining("@Alex"),
        [2],
        [image],
      ),
    );
  });

  it("allows an image-only comment and blocks non-image attachments", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const image = new File(["image"], "screenshot.webp", {
      type: "image/webp",
    });
    const documentFile = new File(["document"], "notes.txt", {
      type: "text/plain",
    });
    renderWithProviders(
      <CommentComposer
        allowImages
        users={users}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Choose comment images"), {
      target: { files: [documentFile] },
    });
    expect(
      screen.getByText("Only image files can be attached to comments."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Choose comment images"), {
      target: { files: [image] },
    });
    await user.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("Image attached", [], [image]),
    );
  });

  it("accepts pasted and dropped images", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const pasted = new File(["pasted"], "pasted.png", { type: "image/png" });
    const dropped = new File(["dropped"], "dropped.gif", { type: "image/gif" });
    renderWithProviders(
      <CommentComposer allowImages users={users} onSubmit={onSubmit} />,
    );

    const textarea = screen.getByLabelText("Comment");
    fireEvent.paste(textarea, { clipboardData: { files: [pasted] } });
    fireEvent.drop(textarea, { dataTransfer: { files: [dropped] } });
    await user.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        "Image attached",
        [],
        [pasted, dropped],
      ),
    );
  });

  it("shows a disabled saving state", () => {
    renderWithProviders(
      <CommentComposer
        initialBody="Saving this comment"
        submitting
        users={users}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
