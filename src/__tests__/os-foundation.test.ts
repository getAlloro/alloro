/**
 * P1 foundation units — OS knowledge base config + lock-reaper processor
 * (plans/07042026-alloro-os-admin-port).
 *
 * Hermetic (§20.1–§20.2, §20.4): no DB, no Redis, no network. The reaper's
 * model seam is mocked with vi.mock; config parsing is exercised through the
 * pure parseOsKnowledgeBaseConfig(env) entry point, covering defaults, env
 * overrides, and the fail-fast error paths (§5.6).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/OsDocumentLockModel", () => ({
  OsDocumentLockModel: {
    deleteExpired: vi.fn(),
  },
}));

import {
  parseOsKnowledgeBaseConfig,
  OS_MIGRATION_EMBEDDING_DIM,
} from "../config/osKnowledgeBase";
import { processOsLockReaper } from "../workers/processors/osLockReaper.processor";
import { OsDocumentLockModel } from "../models/OsDocumentLockModel";
import type { Job } from "bullmq";

describe("osKnowledgeBase config (§5.6)", () => {
  it("resolves the documented defaults from an empty env", () => {
    const config = parseOsKnowledgeBaseConfig({});

    expect(config).toEqual({
      embeddingModel: "text-embedding-3-small",
      embeddingDim: OS_MIGRATION_EMBEDDING_DIM,
      chatModel: "gemini-3.5-flash",
      retrievalK: 10,
      similarityFloor: 0.3,
      linkSuggestFloor: 0.5,
      importMaxFileMb: 25,
      importBatchMaxFiles: 20,
      pdfLowTextChars: 20,
      assetUrlTtlSeconds: 300,
      lockTtlSeconds: 120,
    });
  });

  it("honors env overrides for tunable values", () => {
    const config = parseOsKnowledgeBaseConfig({
      OS_CHAT_MODEL: "gemini-alt",
      OS_RETRIEVAL_K: "5",
      OS_SIMILARITY_FLOOR: "0.45",
      OS_LOCK_TTL_SECONDS: "300",
    });

    expect(config.chatModel).toBe("gemini-alt");
    expect(config.retrievalK).toBe(5);
    expect(config.similarityFloor).toBe(0.45);
    expect(config.lockTtlSeconds).toBe(300);
  });

  it("throws when OS_EMBEDDING_DIM mismatches the vector(1536) migration column", () => {
    expect(() =>
      parseOsKnowledgeBaseConfig({ OS_EMBEDDING_DIM: "3072" })
    ).toThrow(/vector\(1536\)/);
  });

  it("throws on a non-integer numeric value", () => {
    expect(() =>
      parseOsKnowledgeBaseConfig({ OS_LOCK_TTL_SECONDS: "abc" })
    ).toThrow(/OS_LOCK_TTL_SECONDS/);
  });

  it("throws on a similarity floor outside 0..1", () => {
    expect(() =>
      parseOsKnowledgeBaseConfig({ OS_SIMILARITY_FLOOR: "1.5" })
    ).toThrow(/OS_SIMILARITY_FLOOR/);
  });
});

describe("processOsLockReaper (§21.1, §21.4)", () => {
  const job = { id: "os-lock-reaper-tick", attemptsMade: 0 } as unknown as Job;

  beforeEach(() => {
    vi.mocked(OsDocumentLockModel.deleteExpired).mockReset();
  });

  it("deletes expired locks through the model with the current time", async () => {
    vi.mocked(OsDocumentLockModel.deleteExpired).mockResolvedValue(2);

    await processOsLockReaper(job);

    expect(OsDocumentLockModel.deleteExpired).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(OsDocumentLockModel.deleteExpired).mock.calls[0][0];
    expect(arg).toBeInstanceOf(Date);
  });

  it("completes quietly when nothing is expired", async () => {
    vi.mocked(OsDocumentLockModel.deleteExpired).mockResolvedValue(0);

    await expect(processOsLockReaper(job)).resolves.toBeUndefined();
  });

  it("rethrows model failures so BullMQ retry/backoff applies", async () => {
    vi.mocked(OsDocumentLockModel.deleteExpired).mockRejectedValue(
      new Error("connection refused")
    );

    await expect(processOsLockReaper(job)).rejects.toThrow("connection refused");
  });
});
