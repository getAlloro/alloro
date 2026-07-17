import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../test/test-utils";
import type { PmTaskAttachment, PmTaskComment } from "../../types/pm";
import { PmTaskFeed } from "./PmTaskFeed";
import { buildPmTaskFeed, type PmTaskUpload } from "./pmTaskFeed.utils";

const comment = (
  id: string,
  createdAt: string,
  body = `comment ${id}`,
): PmTaskComment => ({
  id,
  task_id: "task-1",
  author_id: 1,
  author_name: "Dave",
  body,
  mentions: [],
  mention_names: {},
  edited_at: null,
  created_at: createdAt,
  is_mine: true,
});

const attachment = (
  id: string,
  createdAt: string,
  filename = `file-${id}.pdf`,
): PmTaskAttachment => ({
  id,
  task_id: "task-1",
  uploaded_by: 1,
  uploaded_by_name: "Dave",
  filename,
  s3_key: `tasks/task-1/${filename}`,
  mime_type: "application/pdf",
  size_bytes: 1024,
  is_previewable: true,
  created_at: createdAt,
  can_delete: true,
});

const upload = (overrides: Partial<PmTaskUpload> = {}): PmTaskUpload => ({
  id: "upload-1",
  filename: "upload.pdf",
  progress: 0.4,
  startedAt: "2026-07-16T10:03:00.000Z",
  ...overrides,
});

const renderComment = (item: PmTaskComment) => <span>{item.body}</span>;
const renderAttachment = (item: PmTaskAttachment) => (
  <span>{item.filename}</span>
);

describe("PmTaskFeed", () => {
  it("merges persisted comments and attachments chronologically with stable ties", () => {
    const feed = buildPmTaskFeed(
      [
        comment("comment-late", "2026-07-16T10:02:00.000Z"),
        comment("comment-tie", "2026-07-16T10:01:00.000Z"),
      ],
      [attachment("attachment-tie", "2026-07-16T10:01:00.000Z")],
      [],
    );

    expect(feed.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "attachment:attachment-tie",
      "comment:comment-tie",
      "comment:comment-late",
    ]);
  });

  it("appends pending and failed uploads after the latest persisted item", () => {
    const feed = buildPmTaskFeed(
      [comment("latest", "2026-07-16T10:10:00.000Z")],
      [attachment("earlier", "2026-07-16T10:00:00.000Z")],
      [
        upload({ id: "pending", startedAt: "2026-07-16T09:00:00.000Z" }),
        upload({
          id: "failed",
          startedAt: "2026-07-16T09:01:00.000Z",
          error: "Upload failed",
        }),
      ],
    );

    expect(feed.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "attachment:earlier",
      "comment:latest",
      "upload:pending",
      "upload:failed",
    ]);
  });

  it("routes both the picker and drop target through the shared upload action", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <PmTaskFeed
        comments={[]}
        attachments={[]}
        uploads={[]}
        isLoading={false}
        onFiles={onFiles}
        renderComment={renderComment}
        renderAttachment={renderAttachment}
      />,
    );
    const picked = new File(["picked"], "picked.txt", { type: "text/plain" });
    const dropped = new File(["dropped"], "dropped.pdf", {
      type: "application/pdf",
    });

    await user.upload(
      screen.getByLabelText("Choose files to attach to this task"),
      picked,
    );
    fireEvent.drop(screen.getByLabelText("Attach files to task conversation"), {
      dataTransfer: { files: [dropped] },
    });

    expect(onFiles).toHaveBeenCalledTimes(2);
    expect(Array.from(onFiles.mock.calls[0][0] as FileList)).toEqual([picked]);
    expect(onFiles.mock.calls[1][0]).toEqual([dropped]);
  });

  it("replaces shared upload progress with the completed attachment and removes deleted files", () => {
    const onFiles = vi.fn().mockResolvedValue(undefined);
    const pending = upload({ progress: 0.65 });
    const completed = attachment(
      "completed",
      "2026-07-16T10:04:00.000Z",
      pending.filename,
    );
    const { rerender } = renderWithProviders(
      <PmTaskFeed
        comments={[comment("comment", "2026-07-16T10:00:00.000Z")]}
        attachments={[]}
        uploads={[pending]}
        isLoading={false}
        onFiles={onFiles}
        renderComment={renderComment}
        renderAttachment={renderAttachment}
      />,
    );

    expect(screen.getByText("65%")).toBeInTheDocument();
    rerender(
      <PmTaskFeed
        comments={[comment("comment", "2026-07-16T10:00:00.000Z")]}
        attachments={[completed]}
        uploads={[]}
        isLoading={false}
        onFiles={onFiles}
        renderComment={renderComment}
        renderAttachment={renderAttachment}
      />,
    );
    expect(screen.queryByText("65%")).not.toBeInTheDocument();
    expect(screen.getByText("upload.pdf")).toBeInTheDocument();

    rerender(
      <PmTaskFeed
        comments={[comment("comment", "2026-07-16T10:00:00.000Z")]}
        attachments={[]}
        uploads={[]}
        isLoading={false}
        onFiles={onFiles}
        renderComment={renderComment}
        renderAttachment={renderAttachment}
      />,
    );
    expect(screen.queryByText("upload.pdf")).not.toBeInTheDocument();
  });
});
