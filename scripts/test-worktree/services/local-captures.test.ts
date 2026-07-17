import Anthropic from "@anthropic-ai/sdk";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startAnthropicFixtureService } from "./anthropic-fixture";
import { startEmailCaptureService } from "./email-capture";

interface StartedService {
  close: () => Promise<void>;
}

interface HttpResult {
  statusCode: number;
  body: string;
}

const EMAIL_PAYLOAD = {
  subject: "Synthetic capture",
  body: "<p>Fixture body</p>",
  recipients: ["recipient@example.test"],
  cc: [],
  bcc: [],
  from: "sender@example.test",
  fromName: "Alloro Test",
};

async function postJson(url: string, value: unknown): Promise<HttpResult> {
  const target = new URL(url);
  const body = JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.once("error", reject);
    request.end(body);
  });
}

describe("worktree local capture services", () => {
  let temporaryDirectory: string;
  const services: StartedService[] = [];

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "alloro-t4-captures-"),
    );
  });

  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.close()));
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("binds email capture to an OS-assigned loopback port and appends JSONL", async () => {
    const evidencePath = path.join(temporaryDirectory, "email.jsonl");
    const service = await startEmailCaptureService({ evidencePath });
    services.push(service);

    const result = await postJson(service.webhookUrl, EMAIL_PAYLOAD);
    const evidence = JSON.parse(
      (await readFile(evidencePath, "utf8")).trim(),
    ) as Record<string, unknown>;
    const fileMode = (await stat(evidencePath)).mode & 0o777;

    expect(service.host).toBe("127.0.0.1");
    expect(service.port).toBeGreaterThan(0);
    expect(result.statusCode).toBe(202);
    expect(JSON.parse(result.body)).toMatchObject({
      id: "email-capture-0001",
      captured: true,
    });
    expect(evidence).toMatchObject({
      kind: "email",
      captureId: "email-capture-0001",
      payload: EMAIL_PAYLOAD,
    });
    expect(fileMode).toBe(0o600);
  });

  it("serves a deterministic response through the installed Anthropic SDK", async () => {
    const evidencePath = path.join(temporaryDirectory, "anthropic.jsonl");
    const service = await startAnthropicFixtureService({ evidencePath });
    services.push(service);
    const client = new Anthropic({
      apiKey: "synthetic-worktree-key",
      baseURL: service.baseUrl,
      maxRetries: 0,
    });

    const first = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: "Synthetic system prompt",
      messages: [{ role: "user", content: "Synthetic fixture input" }],
    });
    const second = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: "Synthetic system prompt",
      messages: [{ role: "user", content: "Synthetic fixture input" }],
    });
    const evidence = await readFile(evidencePath, "utf8");

    expect(service.host).toBe("127.0.0.1");
    expect(service.port).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(first.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"topicType":"STANDARD"'),
    });
    expect(evidence).toContain('"fixture":"gbp-posts"');
    expect(evidence).not.toContain("Synthetic system prompt");
    expect(evidence).not.toContain("Synthetic fixture input");
    expect(evidence).not.toContain("synthetic-worktree-key");
  });
});
