/**
 * CommentsSection — inline markdown comments for a PM task.
 *
 * Mounted inside TaskDetailPanel below AttachmentsSection. Each comment:
 *   - author avatar (single-letter circle), name, relative timestamp
 *   - body rendered as markdown via react-markdown in a strict, raw-HTML-off
 *     configuration (no rehype-raw; disallowedElements blocks script /
 *     iframe / object / embed / style; urlTransform blocks non-http/mailto
 *     schemes like javascript: and data:)
 *   - mentioned users (@Name) highlighted in Alloro orange via a sentinel-
 *     token pre-pass on the body string and a custom `span` component
 *     renderer — we never inject raw HTML into the markdown pipeline.
 *   - author-only edit / delete controls (server still enforces)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow } from "date-fns";
import { Pencil, Trash2, MessageCircle } from "lucide-react";
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  fetchPmUsers,
} from "../../api/pm";
import type { PmTaskComment } from "../../types/pm";
import { CommentComposer, CommentEditor } from "./CommentComposer";
import { getCurrentUserId } from "../../utils/currentUser";
import { PmContextMenu } from "./PmContextMenu";
import { PmConfirmDialog } from "./PmConfirmDialog";
import { logger } from "../../lib/logger";

interface PmUser {
  id: number;
  display_name: string;
  email: string;
}

interface CommentsSectionProps {
  taskId: string;
  onCountChange?: (count: number) => void;
}

/** id="pm-comments-section" anchor target for notification click-through */
export const COMMENTS_SECTION_ANCHOR_ID = "pm-comments-section";

const MENTION_TOKEN_PREFIX = "\u2063@MENTION\u2063"; // invisible separators
const MENTION_TOKEN_SUFFIX = "\u2063/MENTION\u2063";

/**
 * Wrap every @display_name token in a non-printable sentinel so the
 * markdown renderer's default text node walker can find it and substitute
 * a styled span — without us ever enabling raw-HTML passthrough.
 */
function wrapMentions(
  body: string,
  mentionNames: Record<number, string>
): string {
  const names = Object.values(mentionNames);
  if (names.length === 0) return body;
  // Longest-first so "Alexandre" matches before "Alex".
  const sorted = [...names].sort((a, b) => b.length - a.length);
  let out = body;
  for (const name of sorted) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${escaped}\\b`, "g");
    out = out.replace(
      re,
      `${MENTION_TOKEN_PREFIX}${name}${MENTION_TOKEN_SUFFIX}`
    );
  }
  return out;
}

/**
 * Safe URL scheme check. Anything that isn't http(s) or mailto gets an
 * empty href — this defends against `javascript:` and `data:` URIs on
 * anchors while still letting normal markdown links work.
 */
function urlTransform(url: string): string {
  if (typeof url !== "string") return "";
  const lower = url.trim().toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("/") ||
    lower.startsWith("#")
  ) {
    return url;
  }
  return "";
}

const DISALLOWED_ELEMENTS = ["script", "iframe", "object", "embed", "style"];

interface SafeMarkdownProps {
  body: string;
  mentionNames: Record<number, string>;
}

function SafeMarkdown({ body, mentionNames }: SafeMarkdownProps) {
  const wrapped = useMemo(
    () => wrapMentions(body, mentionNames),
    [body, mentionNames]
  );

  return (
    <div className="pm-comment-md">
      <ReactMarkdown
        disallowedElements={DISALLOWED_ELEMENTS}
        urlTransform={urlTransform}
        components={{
          // Replace sentinel-wrapped mentions with a styled span. We run
          // the substitution per text node so mentions inside paragraphs,
          // list items, etc. all get highlighted without injecting HTML.
          p: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => (
            <p>{renderWithMentions(children)}</p>
          ),
          li: ({ children }: React.HTMLAttributes<HTMLLIElement>) => (
            <li>{renderWithMentions(children)}</li>
          ),
          a: ({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#D66853" }}
            >
              {renderWithMentions(children)}
            </a>
          ),
        }}
      >
        {wrapped}
      </ReactMarkdown>
      <style>{`
        .pm-comment-md {
          font-size: 13px;
          color: var(--color-pm-text-primary);
          line-height: 1.55;
        }
        .pm-comment-md p { margin: 0 0 6px; }
        .pm-comment-md p:last-child { margin-bottom: 0; }
        .pm-comment-md ul, .pm-comment-md ol { margin: 0 0 6px; padding-left: 20px; }
        .pm-comment-md code {
          background: var(--color-pm-bg-hover);
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 12px;
        }
        .pm-comment-md pre {
          background: var(--color-pm-bg-hover);
          padding: 8px 10px;
          border-radius: 6px;
          overflow-x: auto;
          font-size: 12px;
        }
        .pm-mention {
          color: #D66853;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

function renderWithMentions(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") {
    return substituteMentions(children);
  }
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string" ? (
        <span key={i}>{substituteMentions(c)}</span>
      ) : (
        c
      )
    );
  }
  return children;
}

function substituteMentions(text: string): React.ReactNode {
  if (!text.includes(MENTION_TOKEN_PREFIX)) return text;
  const parts: React.ReactNode[] = [];
  let rest = text;
  let keyIdx = 0;
  while (rest.length > 0) {
    const start = rest.indexOf(MENTION_TOKEN_PREFIX);
    if (start < 0) {
      parts.push(rest);
      break;
    }
    const end = rest.indexOf(
      MENTION_TOKEN_SUFFIX,
      start + MENTION_TOKEN_PREFIX.length
    );
    if (end < 0) {
      // malformed — bail out and render the raw remainder
      parts.push(rest);
      break;
    }
    if (start > 0) parts.push(rest.slice(0, start));
    const name = rest.slice(start + MENTION_TOKEN_PREFIX.length, end);
    parts.push(
      <span key={`m-${keyIdx++}`} className="pm-mention">
        @{name}
      </span>
    );
    rest = rest.slice(end + MENTION_TOKEN_SUFFIX.length);
  }
  return parts;
}

export function CommentsSection({ taskId, onCountChange }: CommentsSectionProps) {
  const [comments, setComments] = useState<PmTaskComment[]>([]);
  const [users, setUsers] = useState<PmUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    comment: PmTaskComment;
  } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const currentUserId = getCurrentUserId();

  const refresh = useCallback(async () => {
    try {
      const rows = await listComments(taskId);
      setComments(rows);
    } catch (err) {
      logger.error("[CommentsSection] list failed:", err);
    }
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEditingId(null);
    Promise.all([listComments(taskId), fetchPmUsers()])
      .then(([rows, userList]) => {
        if (cancelled) return;
        setComments(rows);
        setUsers(userList);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    onCountChange?.(comments.length);
  }, [comments.length, onCountChange]);

  const handleCreate = useCallback(
    async (body: string, mentions: number[]) => {
      setSubmitting(true);
      setError(null);
      try {
        const created = await createComment(taskId, body, mentions);
        setComments((prev) => [...prev, created]);
      } catch (err: unknown) {
        const e = err as {
          response?: { data?: { error?: string } };
          message?: string;
        };
        setError(e?.response?.data?.error || e?.message || "Create failed");
      } finally {
        setSubmitting(false);
      }
    },
    [taskId]
  );

  const handleEdit = useCallback(
    async (commentId: string, body: string, mentions: number[]) => {
      setSubmitting(true);
      setError(null);
      try {
        const updated = await updateComment(taskId, commentId, body, mentions);
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? updated : c))
        );
        setEditingId(null);
      } catch (err: unknown) {
        const e = err as {
          response?: { data?: { error?: string } };
          message?: string;
        };
        setError(e?.response?.data?.error || e?.message || "Edit failed");
      } finally {
        setSubmitting(false);
      }
    },
    [taskId]
  );

  const handleDelete = useCallback(
    async (commentId: string) => {
      try {
        await deleteComment(taskId, commentId);
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch (err) {
        logger.error("[CommentsSection] delete failed:", err);
        await refresh();
      }
    },
    [taskId, refresh]
  );

  return (
    <div id={COMMENTS_SECTION_ANCHOR_ID}>
      <label className="mb-2 block text-xs font-medium text-pm-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          Comments
          {comments.length > 0 && (
            <span className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
              ({comments.length})
            </span>
          )}
        </span>
      </label>

      {loading ? (
        <p className="mt-2 text-[11px] text-pm-text-muted">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="mb-3 text-[12px]" style={{ color: "var(--color-pm-text-muted)" }}>
          No comments yet. Be the first.
        </p>
      ) : (
        <ul className="mb-3 space-y-3">
          {comments.map((c) => {
            // Server-verified is_mine is authoritative; fall back to the
            // client JWT check if the server didn't stamp it (old rows).
            const isAuthor =
              typeof c.is_mine === "boolean"
                ? c.is_mine
                : currentUserId !== null && c.author_id === currentUserId;
            const isEditing = editingId === c.id;
            return (
              <li
                key={c.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, comment: c });
                }}
                className="group rounded-lg border px-3 py-2.5"
                style={{
                  borderColor: "var(--color-pm-border)",
                  backgroundColor: "var(--color-pm-bg-primary)",
                }}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{
                      backgroundColor: "var(--color-pm-bg-secondary)",
                      color: "#D66853",
                      border: "1px solid var(--color-pm-border)",
                    }}
                  >
                    {c.author_name.charAt(0).toUpperCase()}
                  </span>
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: "var(--color-pm-text-primary)" }}
                  >
                    {c.author_name}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--color-pm-text-muted)" }}
                  >
                    {formatDistanceToNow(new Date(c.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                  {c.edited_at && (
                    <span
                      className="text-[10px]"
                      title={`Edited ${new Date(c.edited_at).toLocaleString()}`}
                      style={{ color: "var(--color-pm-text-muted)" }}
                    >
                      (edited)
                    </span>
                  )}
                  {isAuthor && !isEditing && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => setEditingId(c.id)}
                        title="Edit"
                        aria-label="Edit comment"
                        className="rounded p-1 text-pm-text-muted hover:bg-pm-bg-secondary hover:text-pm-text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(c.id)}
                        title="Delete"
                        aria-label="Delete comment"
                        className="rounded p-1 text-pm-text-muted hover:bg-red-500/10 hover:text-pm-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <CommentEditor
                    taskId={taskId}
                    users={users}
                    initialBody={c.body}
                    initialMentions={c.mentions}
                    submitting={submitting}
                    onSubmit={(body, mentions) =>
                      handleEdit(c.id, body, mentions)
                    }
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <SafeMarkdown body={c.body} mentionNames={c.mention_names} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="mb-2 text-[11px] text-pm-danger">{error}</p>
      )}

      <CommentComposer
        taskId={taskId}
        users={users}
        submitting={submitting}
        onSubmit={handleCreate}
      />

      {ctxMenu && (() => {
        const c = ctxMenu.comment;
        const mine =
          typeof c.is_mine === "boolean"
            ? c.is_mine
            : currentUserId !== null && c.author_id === currentUserId;
        return (
          <PmContextMenu
            open
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
            items={[
              {
                id: "edit",
                label: "Edit",
                icon: <Pencil className="h-3.5 w-3.5" />,
                disabled: !mine,
                onClick: () => setEditingId(c.id),
              },
              {
                id: "delete",
                label: "Delete",
                icon: <Trash2 className="h-3.5 w-3.5" />,
                danger: true,
                disabled: !mine,
                onClick: () => setPendingDeleteId(c.id),
              },
            ]}
          />
        );
      })()}

      <PmConfirmDialog
        open={!!pendingDeleteId}
        danger
        title="Delete comment?"
        message="This comment will be removed permanently. This can't be undone."
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => !deleting && setPendingDeleteId(null)}
        onConfirm={async () => {
          if (!pendingDeleteId) return;
          setDeleting(true);
          try {
            await handleDelete(pendingDeleteId);
          } finally {
            setDeleting(false);
            setPendingDeleteId(null);
          }
        }}
      />
    </div>
  );
}
