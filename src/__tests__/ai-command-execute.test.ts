/**
 * Unit tests — AI Command edit-persistence fix
 * (plans/06262026-ai-command-edit-persistence-fix).
 *
 * Two seams are covered:
 *
 *   1. resolvePageDraftId (util.ai-command-shared) — the core fix. It must pin
 *      ONE draft per page path so a batch's read (getCurrentHtml) and write
 *      (saveEditedHtml) resolve the same row and edits stack instead of
 *      clobbering. Asserted: reuse-when-pinned, reuse-existing-draft (no
 *      createDraft), create-from-published-then-pin, and idempotency across two
 *      calls for the same path (the regression that caused only the last write
 *      per section to survive).
 *
 *   2. extractAddedTokens / changeIsPresent (util.ai-command-verify) — the
 *      verify net. They decide whether an edit's distinctive new content
 *      actually reached the published page. Asserted against the real failure
 *      this batch hit: on a page where the "Free Checkup → Free Audit" label
 *      landed but the "cal.com → /book-a-demo" link was lost, the link edit is
 *      detected as absent (→ would be downgraded to failed) while the label edit
 *      verifies present.
 *
 * Data strategy: Option B (mock the data layer). PageModel + createDraft are
 * stubbed, so the suite runs with NO live Postgres and NO network. Synthetic
 * ids/values only (§20.4).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Model + service seams for resolvePageDraftId ──────────────────────────
const findRawByProjectPathStatus = vi.fn();
const createDraft = vi.fn();

vi.mock("../models/website-builder/PageModel", () => ({
  PageModel: {
    findRawByProjectPathStatus: (...a: unknown[]) =>
      findRawByProjectPathStatus(...a),
  },
}));
vi.mock("../controllers/admin-websites/feature-services/service.page-editor", () => ({
  createDraft: (...a: unknown[]) => createDraft(...a),
}));

import { resolvePageDraftId } from "../controllers/admin-websites/feature-utils/util.ai-command-shared";
import {
  extractAddedTokens,
  changeIsPresent,
} from "../controllers/admin-websites/feature-utils/util.ai-command-verify";

const PROJECT = "proj-1";
const PATH = "/benefits";
const origPage = { project_id: PROJECT, path: PATH };

// Minimal ExecutionContext — resolvePageDraftId only touches pageDrafts.
const makeCtx = () => ({ pageDrafts: new Map<string, string>() } as never);

describe("resolvePageDraftId — one pinned draft per page (core fix)", () => {
  beforeEach(() => {
    findRawByProjectPathStatus.mockReset();
    createDraft.mockReset();
  });

  it("returns the already-pinned draft without touching the DB", async () => {
    const ctx = makeCtx();
    (ctx as unknown as { pageDrafts: Map<string, string> }).pageDrafts.set(
      PATH,
      "DRAFT-PINNED"
    );

    const id = await resolvePageDraftId(origPage, ctx);

    expect(id).toBe("DRAFT-PINNED");
    expect(findRawByProjectPathStatus).not.toHaveBeenCalled();
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("reuses an existing draft as-is (never re-drafts, which would wipe edits)", async () => {
    findRawByProjectPathStatus.mockImplementation(
      (_p: string, _path: string, status: string) =>
        status === "draft"
          ? { id: "DRAFT-EXISTING", status: "draft", project_id: PROJECT, path: PATH }
          : null
    );
    const ctx = makeCtx();

    const id = await resolvePageDraftId(origPage, ctx);

    expect(id).toBe("DRAFT-EXISTING");
    expect(createDraft).not.toHaveBeenCalled();
    expect(
      (ctx as unknown as { pageDrafts: Map<string, string> }).pageDrafts.get(PATH)
    ).toBe("DRAFT-EXISTING");
  });

  it("creates a draft from the published row when none exists, then pins it", async () => {
    findRawByProjectPathStatus.mockImplementation(
      (_p: string, _path: string, status: string) =>
        status === "published"
          ? { id: "PUB-1", status: "published", project_id: PROJECT, path: PATH }
          : null
    );
    createDraft.mockResolvedValue({ page: { id: "NEW-DRAFT" }, isExisting: false });
    const ctx = makeCtx();

    const id = await resolvePageDraftId(origPage, ctx);

    expect(createDraft).toHaveBeenCalledOnce();
    expect(createDraft).toHaveBeenCalledWith(PROJECT, "PUB-1");
    expect(id).toBe("NEW-DRAFT");
  });

  it("is idempotent across calls for the same path — read and write share ONE row", async () => {
    findRawByProjectPathStatus.mockImplementation(
      (_p: string, _path: string, status: string) =>
        status === "published"
          ? { id: "PUB-1", status: "published", project_id: PROJECT, path: PATH }
          : null
    );
    createDraft.mockResolvedValue({ page: { id: "NEW-DRAFT" }, isExisting: false });
    const ctx = makeCtx();

    const first = await resolvePageDraftId(origPage, ctx); // getCurrentHtml read
    const second = await resolvePageDraftId(origPage, ctx); // saveEditedHtml write

    expect(first).toBe("NEW-DRAFT");
    expect(second).toBe("NEW-DRAFT");
    expect(createDraft).toHaveBeenCalledOnce(); // not re-drafted on the 2nd call
  });

  it("throws when there is no active page at the path", async () => {
    findRawByProjectPathStatus.mockResolvedValue(null);
    await expect(resolvePageDraftId(origPage, makeCtx())).rejects.toThrow(
      /No active page/
    );
  });
});

describe("verify net — extractAddedTokens / changeIsPresent", () => {
  it("derives the new link as the distinctive added token", () => {
    const added = extractAddedTokens(
      'href="https://cal.com/alloro"',
      'href="/book-a-demo"'
    );
    expect(added).toContain("/book-a-demo");
    expect(added).not.toContain("https://cal.com/alloro");
  });

  it("treats a pure no-op (no new tokens) as not-assertable → present", () => {
    expect(changeIsPresent([], "anything at all")).toBe(true);
  });

  it("confirms the link edit when /book-a-demo is in the published section", () => {
    expect(
      changeIsPresent(["/book-a-demo"], '<a href="/book-a-demo">Book a demo</a>')
    ).toBe(true);
  });

  it("flags the link edit as absent when the published section still has cal.com (the bug)", () => {
    expect(
      changeIsPresent(
        ["/book-a-demo"],
        '<a href="https://cal.com/alloro">Book a demo</a>'
      )
    ).toBe(false);
  });

  it("mirrors the real batch: label landed (verifies) but link lost (flagged) on the same section", () => {
    const publishedClobbered =
      '<section><a href="https://cal.com/alloro">Book a demo</a><span>Free Audit</span></section>';

    const linkAdded = extractAddedTokens(
      '<a href="https://cal.com/alloro">Free Checkup</a>',
      '<a href="/book-a-demo">Free Checkup</a>'
    );
    const labelAdded = extractAddedTokens(
      "<span>Free Checkup</span>",
      "<span>Free Audit</span>"
    );

    // Link change is provably absent → would be downgraded to failed.
    expect(changeIsPresent(linkAdded, publishedClobbered)).toBe(false);
    // Label change is present → stays executed.
    expect(changeIsPresent(labelAdded, publishedClobbered)).toBe(true);
  });
});
