/**
 * Tests for src/services/notion/substrateWriter.ts
 *
 * Exercises the retry semantics. Mocks axios so no real Notion calls are
 * made. Asserts:
 *   - missing NOTION_TOKEN throws SubstrateWriteError(AUTH_FAILED)
 *   - first-try success returns the response
 *   - 409 on first call then success on second returns the second response
 *   - 409 twice throws SubstrateWriteError(CONFLICT_AFTER_RETRY)
 *   - 429 with Retry-After backs off then retries
 *   - non-retriable status throws SubstrateWriteError(UNKNOWN)
 *   - logConflict writes a [SUBSTRATE_WRITE_CONFLICT] line to console.error
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import axios from "axios";
import {
  appendBlockChildren,
  updateBlock,
  patchPage,
  SubstrateWriteError,
} from "../../src/services/notion/substrateWriter";

vi.mock("axios");

const mockedAxios = axios as unknown as {
  patch: Mock;
  isAxiosError: typeof axios.isAxiosError;
};

function buildAxiosError(
  status: number,
  data: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const err = new Error(`Mock axios error ${status}`) as Error & {
    isAxiosError: boolean;
    response: { status: number; data: Record<string, unknown>; headers: Record<string, string> };
  };
  err.isAxiosError = true;
  err.response = { status, data, headers };
  return err;
}

describe("substrateWriter", () => {
  const originalToken = process.env.NOTION_TOKEN;

  beforeEach(() => {
    process.env.NOTION_TOKEN = "test-token";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    (mockedAxios.patch as Mock).mockReset();
    // axios.isAxiosError is a real function the wrapper relies on; restore it.
    (axios.isAxiosError as unknown as Mock) = vi.fn(
      (e: unknown) =>
        typeof e === "object" && e !== null && (e as { isAxiosError?: boolean }).isAxiosError === true,
    ) as unknown as typeof axios.isAxiosError;
  });

  afterEach(() => {
    process.env.NOTION_TOKEN = originalToken;
    vi.restoreAllMocks();
  });

  describe("auth", () => {
    it("throws AUTH_FAILED when NOTION_TOKEN is missing", async () => {
      delete process.env.NOTION_TOKEN;
      await expect(
        appendBlockChildren({
          blockId: "abc",
          children: [{ paragraph: { rich_text: [] } }],
        }),
      ).rejects.toBeInstanceOf(SubstrateWriteError);
    });

    it("throws AUTH_FAILED with the correct code on missing token", async () => {
      delete process.env.NOTION_TOKEN;
      try {
        await appendBlockChildren({
          blockId: "abc",
          children: [{ paragraph: { rich_text: [] } }],
        });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SubstrateWriteError);
        expect((err as SubstrateWriteError).code).toBe("AUTH_FAILED");
      }
    });
  });

  describe("appendBlockChildren happy path", () => {
    it("returns the Notion response on first-try success", async () => {
      (mockedAxios.patch as Mock).mockResolvedValueOnce({
        status: 200,
        data: { object: "list", results: [] },
      });

      const res = await appendBlockChildren({
        blockId: "block-1",
        children: [{ paragraph: { rich_text: [] } }],
      });

      expect(res.status).toBe(200);
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("passes `after` to the API when provided", async () => {
      (mockedAxios.patch as Mock).mockResolvedValueOnce({
        status: 200,
        data: { object: "list" },
      });

      await appendBlockChildren({
        blockId: "block-1",
        children: [{ paragraph: { rich_text: [] } }],
        after: "previous-block",
      });

      const callArgs = (mockedAxios.patch as Mock).mock.calls[0];
      expect(callArgs[1]).toMatchObject({
        children: expect.any(Array),
        after: "previous-block",
      });
    });
  });

  describe("409 conflict retry", () => {
    it("retries once on 409 then returns success on second try", async () => {
      (mockedAxios.patch as Mock)
        .mockRejectedValueOnce(
          buildAxiosError(409, { code: "conflict_error" }),
        )
        .mockResolvedValueOnce({
          status: 200,
          data: { object: "list", results: [] },
        });

      const res = await appendBlockChildren({
        blockId: "block-1",
        children: [{ paragraph: { rich_text: [] } }],
        actor: "CC",
        reason: "test-append",
      });

      expect(res.status).toBe(200);
      expect(mockedAxios.patch).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalled();
    });

    it("throws CONFLICT_AFTER_RETRY on two consecutive 409s", async () => {
      (mockedAxios.patch as Mock)
        .mockRejectedValueOnce(
          buildAxiosError(409, { code: "conflict_error", request_id: "req-1" }),
        )
        .mockRejectedValueOnce(
          buildAxiosError(409, { code: "conflict_error", request_id: "req-2" }),
        );

      try {
        await appendBlockChildren({
          blockId: "block-1",
          children: [{ paragraph: { rich_text: [] } }],
          actor: "CC",
          reason: "test-append",
        });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SubstrateWriteError);
        expect((err as SubstrateWriteError).code).toBe("CONFLICT_AFTER_RETRY");
        expect((err as SubstrateWriteError).attemptCount).toBe(2);
        expect((err as SubstrateWriteError).notionRequestId).toBe("req-2");
      }
      expect(mockedAxios.patch).toHaveBeenCalledTimes(2);
    });

    it("logs [SUBSTRATE_WRITE_CONFLICT] on each 409 attempt", async () => {
      (mockedAxios.patch as Mock)
        .mockRejectedValueOnce(buildAxiosError(409, { code: "conflict_error" }))
        .mockRejectedValueOnce(buildAxiosError(409, { code: "conflict_error" }));

      try {
        await appendBlockChildren({
          blockId: "abc",
          children: [{ paragraph: { rich_text: [] } }],
          actor: "CW",
          reason: "voice-sweep",
        });
      } catch {
        // expected
      }

      const errorCalls = (console.error as unknown as Mock).mock.calls.map(
        (c: unknown[]) => String(c[0]),
      );
      expect(
        errorCalls.some((line: string) =>
          line.includes("[SUBSTRATE_WRITE_CONFLICT]"),
        ),
      ).toBe(true);
      expect(
        errorCalls.some((line: string) =>
          line.includes("op=append_block_children"),
        ),
      ).toBe(true);
      expect(errorCalls.some((line: string) => line.includes("actor=CW"))).toBe(
        true,
      );
    });
  });

  describe("429 rate limit retry", () => {
    it("retries once on 429 then returns success on second try", async () => {
      (mockedAxios.patch as Mock)
        .mockRejectedValueOnce(
          buildAxiosError(
            429,
            { code: "rate_limited" },
            { "retry-after": "0" },
          ),
        )
        .mockResolvedValueOnce({ status: 200, data: {} });

      const res = await appendBlockChildren({
        blockId: "x",
        children: [{ paragraph: { rich_text: [] } }],
      });

      expect(res.status).toBe(200);
      expect(mockedAxios.patch).toHaveBeenCalledTimes(2);
    });

    it("throws RATE_LIMIT_AFTER_RETRY on two consecutive 429s", async () => {
      (mockedAxios.patch as Mock)
        .mockRejectedValueOnce(buildAxiosError(429, { code: "rate_limited" }))
        .mockRejectedValueOnce(buildAxiosError(429, { code: "rate_limited" }));

      try {
        await appendBlockChildren({
          blockId: "x",
          children: [{ paragraph: { rich_text: [] } }],
        });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SubstrateWriteError);
        expect((err as SubstrateWriteError).code).toBe(
          "RATE_LIMIT_AFTER_RETRY",
        );
      }
    });
  });

  describe("non-retriable errors", () => {
    it("throws AUTH_FAILED on 401 without retry", async () => {
      (mockedAxios.patch as Mock).mockRejectedValueOnce(
        buildAxiosError(401, { code: "unauthorized" }),
      );

      try {
        await appendBlockChildren({
          blockId: "x",
          children: [{ paragraph: { rich_text: [] } }],
        });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SubstrateWriteError);
        expect((err as SubstrateWriteError).code).toBe("AUTH_FAILED");
        expect((err as SubstrateWriteError).attemptCount).toBe(1);
      }
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("throws UNKNOWN on 500 without retry", async () => {
      (mockedAxios.patch as Mock).mockRejectedValueOnce(
        buildAxiosError(500, { code: "internal_server_error" }),
      );

      try {
        await appendBlockChildren({
          blockId: "x",
          children: [{ paragraph: { rich_text: [] } }],
        });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SubstrateWriteError);
        expect((err as SubstrateWriteError).code).toBe("UNKNOWN");
      }
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateBlock and patchPage", () => {
    it("updateBlock posts to /blocks/{id}", async () => {
      (mockedAxios.patch as Mock).mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      await updateBlock({
        blockId: "block-99",
        body: { paragraph: { rich_text: [] } },
      });

      const url = (mockedAxios.patch as Mock).mock.calls[0][0];
      expect(url).toMatch(/\/blocks\/block-99$/);
    });

    it("patchPage posts to /pages/{id} with properties wrapped", async () => {
      (mockedAxios.patch as Mock).mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      await patchPage({
        pageId: "page-7",
        properties: { title: { title: [] } },
      });

      const url = (mockedAxios.patch as Mock).mock.calls[0][0];
      expect(url).toMatch(/\/pages\/page-7$/);
      const body = (mockedAxios.patch as Mock).mock.calls[0][1];
      expect(body).toMatchObject({ properties: { title: { title: [] } } });
    });
  });
});
