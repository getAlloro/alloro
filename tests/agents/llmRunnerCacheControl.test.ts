/**
 * Tests for src/agents/service.llm-runner.ts cacheSystem flag.
 *
 * Verifies that the runAgent caller can opt into ephemeral prompt caching
 * on the system prompt block and that the default behavior is unchanged
 * (system field stays a plain string when cacheSystem is omitted).
 *
 * Mocks the Anthropic SDK at the module boundary so no live API call is made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SDK before importing the module under test.
const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: messagesCreate };
    },
  };
});

import { runAgent } from "../../src/agents/service.llm-runner";

describe("runAgent cacheSystem flag", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  });

  it("sends system as a plain string when cacheSystem is omitted", async () => {
    await runAgent({
      systemPrompt: "you are a test agent",
      userMessage: "hello",
    });

    const callArgs = messagesCreate.mock.calls[0][0];
    expect(callArgs.system).toBe("you are a test agent");
    expect(typeof callArgs.system).toBe("string");
  });

  it("sends system as a plain string when cacheSystem is false", async () => {
    await runAgent({
      systemPrompt: "you are a test agent",
      userMessage: "hello",
      cacheSystem: false,
    });

    const callArgs = messagesCreate.mock.calls[0][0];
    expect(callArgs.system).toBe("you are a test agent");
    expect(typeof callArgs.system).toBe("string");
  });

  it("wraps system in a TextBlockParam[] with cache_control when cacheSystem is true", async () => {
    await runAgent({
      systemPrompt: "you are a test agent",
      userMessage: "hello",
      cacheSystem: true,
    });

    const callArgs = messagesCreate.mock.calls[0][0];
    expect(Array.isArray(callArgs.system)).toBe(true);
    expect(callArgs.system).toEqual([
      {
        type: "text",
        text: "you are a test agent",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("preserves the rest of the request shape regardless of cacheSystem", async () => {
    await runAgent({
      systemPrompt: "sys",
      userMessage: "msg",
      cacheSystem: true,
      maxTokens: 256,
      temperature: 0.2,
    });

    const callArgs = messagesCreate.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(256);
    expect(callArgs.temperature).toBe(0.2);
    expect(callArgs.messages).toEqual([{ role: "user", content: "msg" }]);
  });
});
