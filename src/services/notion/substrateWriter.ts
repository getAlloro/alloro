/**
 * Notion Substrate Writer
 *
 * Resilient wrapper around the Notion API write endpoints used by the
 * Five-Claude Shared Substrate (Alloro State of Now page and siblings).
 *
 * The pre-mortem dispatched 2026-05-23 surfaced a silent-drop failure
 * mode: when two Claudes (CC, CW, Cowork, Jo's, Dave's) append to the
 * same Section in the same second, the Notion API returns HTTP 409
 * conflict_error and one write disappears unless the caller retries.
 *
 * Today, every substrate write path in this codebase calls
 * https://api.notion.com/v1 via axios with no retry. This file adds the
 * minimal retry+backoff layer required to keep substrate appends durable.
 *
 * Scope is intentionally narrow:
 *   - append_block_children (the only substrate write that takes place
 *     concurrently across Claudes today)
 *   - update_a_block (used for fixes, e.g. the em-dash spot-fix)
 *   - patch_page  (used to retitle referenced pages)
 *
 * Anything beyond these three operations should keep using axios directly
 * until concurrency becomes a documented pain point.
 *
 * Retry policy (per pre-mortem mitigation #3):
 *   - On 409 conflict_error: wait 500ms, refetch target's children, retry once.
 *   - On 429 rate_limited: wait the Retry-After header (default 1000ms), retry once.
 *   - On second failure: throw a structured SubstrateWriteError so the
 *     caller decides; also console.error a [SUBSTRATE_WRITE_CONFLICT]
 *     line that future log scrapers can detect.
 *
 * Future work (not in this commit):
 *   - Wire the failure log into a Notion audit database once a schema exists
 *     (the State Transition Log requires a cardId, which substrate writes do
 *     not have; coupling them would be a category error).
 *   - Add prometheus-style metrics counters once the metrics layer ships.
 */

import axios, { AxiosError, AxiosResponse } from "axios";

// -- Constants ----------------------------------------------------------

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const CONFLICT_BACKOFF_MIN_MS = 250;
const CONFLICT_BACKOFF_MAX_MS = 750;
const RATE_LIMIT_DEFAULT_BACKOFF_MS = 1000;

/**
 * Jittered backoff for 409 conflict retry. Returns a random value in
 * [CONFLICT_BACKOFF_MIN_MS, CONFLICT_BACKOFF_MAX_MS]. Jitter prevents
 * retry storms at five-Claude scale: if two Claudes hit a 409 at the
 * same instant on the same block, fixed 500ms backoff makes them retry
 * at the same instant again. A 250-750ms range desynchronizes the retry
 * window. Exported for test access only.
 */
export function conflictBackoffMs(): number {
  return (
    CONFLICT_BACKOFF_MIN_MS +
    Math.random() * (CONFLICT_BACKOFF_MAX_MS - CONFLICT_BACKOFF_MIN_MS)
  );
}

// -- Types --------------------------------------------------------------

export type SubstrateActor =
  | "CC"
  | "CW"
  | "Cowork"
  | "JosClaude"
  | "DavesClaude"
  | "CronVerifier";

export interface AppendChildrenInput {
  /** Parent block or page ID. */
  blockId: string;
  /** Children to append. Notion API shape (paragraph, bulleted_list_item, etc.). */
  children: unknown[];
  /** Optional: existing block ID to position the appended children after. */
  after?: string;
  /** Optional: identify the Claude appending. Used in the structured failure log. */
  actor?: SubstrateActor;
  /**
   * Optional: a human-readable description of what is being appended.
   * Used in the structured failure log so a future operator can grep for
   * the failure without re-deriving context from the block ID.
   */
  reason?: string;
}

export interface UpdateBlockInput {
  blockId: string;
  /** Notion block body keyed by block type (e.g. `{ paragraph: { rich_text: [...] } }`). */
  body: Record<string, unknown>;
  actor?: SubstrateActor;
  reason?: string;
}

export interface PatchPageInput {
  pageId: string;
  /** Page property map (e.g. `{ title: { title: [...] } }`). */
  properties: Record<string, unknown>;
  actor?: SubstrateActor;
  reason?: string;
}

export class SubstrateWriteError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CONFLICT_AFTER_RETRY"
      | "RATE_LIMIT_AFTER_RETRY"
      | "AUTH_FAILED"
      | "UNKNOWN",
    public readonly httpStatus: number | null,
    public readonly attemptCount: number,
    public readonly notionRequestId?: string,
  ) {
    super(message);
    this.name = "SubstrateWriteError";
  }
}

// -- Internal helpers ---------------------------------------------------

function notionHeaders(): Record<string, string> {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new SubstrateWriteError(
      "NOTION_TOKEN env var not set. Substrate writes require it.",
      "AUTH_FAILED",
      null,
      0,
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(err: AxiosError): number {
  const header = err.response?.headers?.["retry-after"];
  if (typeof header === "string") {
    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 10000);
    }
  }
  return RATE_LIMIT_DEFAULT_BACKOFF_MS;
}

function logConflict(
  operation: string,
  input: { actor?: SubstrateActor; reason?: string; targetId: string },
  err: AxiosError,
  attempt: number,
): void {
  const notionRequestId =
    (err.response?.data as { request_id?: string } | undefined)?.request_id ??
    null;
  const status = err.response?.status ?? null;
  const code =
    (err.response?.data as { code?: string } | undefined)?.code ?? null;
  console.error(
    `[SUBSTRATE_WRITE_CONFLICT] op=${operation} target=${input.targetId} ` +
      `actor=${input.actor ?? "unknown"} reason=${input.reason ?? "unspecified"} ` +
      `status=${status} code=${code} attempt=${attempt} request_id=${notionRequestId}`,
  );
}

function shouldRetry(err: AxiosError): "conflict" | "rate" | "no" {
  const status = err.response?.status;
  const data = err.response?.data as { code?: string } | undefined;
  if (status === 409 || data?.code === "conflict_error") return "conflict";
  if (status === 429 || data?.code === "rate_limited") return "rate";
  return "no";
}

// -- Public API ---------------------------------------------------------

/**
 * Append children to a Notion block with one-shot retry on 409 / 429.
 *
 * Returns the raw Notion API response on success. Throws SubstrateWriteError
 * if the operation fails after retry.
 */
export async function appendBlockChildren(
  input: AppendChildrenInput,
): Promise<AxiosResponse> {
  const url = `${NOTION_API_BASE}/blocks/${input.blockId}/children`;
  const body: Record<string, unknown> = { children: input.children };
  if (input.after) body.after = input.after;

  return runWithRetry(
    "append_block_children",
    { actor: input.actor, reason: input.reason, targetId: input.blockId },
    async () => axios.patch(url, body, { headers: notionHeaders() }),
  );
}

/**
 * Update a Notion block's content with one-shot retry on 409 / 429.
 */
export async function updateBlock(
  input: UpdateBlockInput,
): Promise<AxiosResponse> {
  const url = `${NOTION_API_BASE}/blocks/${input.blockId}`;
  return runWithRetry(
    "update_block",
    { actor: input.actor, reason: input.reason, targetId: input.blockId },
    async () => axios.patch(url, input.body, { headers: notionHeaders() }),
  );
}

/**
 * Patch a Notion page's properties (e.g. rename a title) with retry.
 */
export async function patchPage(input: PatchPageInput): Promise<AxiosResponse> {
  const url = `${NOTION_API_BASE}/pages/${input.pageId}`;
  return runWithRetry(
    "patch_page",
    { actor: input.actor, reason: input.reason, targetId: input.pageId },
    async () =>
      axios.patch(
        url,
        { properties: input.properties },
        { headers: notionHeaders() },
      ),
  );
}

// -- Core retry loop ----------------------------------------------------

async function runWithRetry(
  operation: string,
  context: { actor?: SubstrateActor; reason?: string; targetId: string },
  action: () => Promise<AxiosResponse>,
): Promise<AxiosResponse> {
  let attempt = 1;
  try {
    return await action();
  } catch (err) {
    if (!axios.isAxiosError(err)) throw err;
    const mode = shouldRetry(err);
    if (mode === "no") {
      logConflict(operation, context, err, attempt);
      const status = err.response?.status ?? null;
      const code =
        (err.response?.data as { code?: string } | undefined)?.code ?? null;
      if (status === 401 || code === "unauthorized") {
        throw new SubstrateWriteError(
          `Notion auth failed on ${operation} for ${context.targetId}.`,
          "AUTH_FAILED",
          status,
          attempt,
        );
      }
      throw new SubstrateWriteError(
        `Notion ${operation} failed with non-retriable error (status ${status}, code ${code}).`,
        "UNKNOWN",
        status,
        attempt,
      );
    }
    logConflict(operation, context, err, attempt);
    const backoff =
      mode === "conflict" ? conflictBackoffMs() : parseRetryAfter(err);
    await sleep(backoff);
    attempt = 2;
    try {
      return await action();
    } catch (err2) {
      if (!axios.isAxiosError(err2)) throw err2;
      logConflict(operation, context, err2, attempt);
      const status = err2.response?.status ?? null;
      const notionRequestId =
        (err2.response?.data as { request_id?: string } | undefined)
          ?.request_id ?? undefined;
      const finalCode =
        mode === "conflict"
          ? ("CONFLICT_AFTER_RETRY" as const)
          : ("RATE_LIMIT_AFTER_RETRY" as const);
      throw new SubstrateWriteError(
        `Notion ${operation} failed after one retry on ${context.targetId} (mode=${mode}).`,
        finalCode,
        status,
        attempt,
        notionRequestId,
      );
    }
  }
}
