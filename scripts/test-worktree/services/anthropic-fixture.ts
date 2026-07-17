import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createGbpPostAnthropicFixture,
} from "../fixtures/anthropic-responses";
import logger from "../../../src/lib/logger";
import {
  LocalServiceRequestError,
  LOOPBACK_HOST,
  appendJsonLine,
  closeHttpServer,
  isRecord,
  listenOnLoopback,
  prepareJsonlEvidence,
  readJsonBody,
  writeJson,
} from "./service-http-utils";

const MESSAGES_PATH = "/v1/messages";
const HEALTH_PATH = "/health";
const JSON_CONTENT_TYPE = "application/json";

interface AnthropicMessageRequest {
  model: string;
  maxTokens: number;
  messageCount: number;
  hasSystem: boolean;
}

export interface AnthropicFixtureServiceOptions {
  evidencePath: string;
}

export interface AnthropicFixtureServiceHandle {
  host: typeof LOOPBACK_HOST;
  port: number;
  origin: string;
  baseUrl: string;
  healthUrl: string;
  evidencePath: string;
  close: () => Promise<void>;
}

function parseAnthropicRequest(value: unknown): AnthropicMessageRequest {
  if (
    !isRecord(value)
    || typeof value.model !== "string"
    || value.model.length === 0
    || typeof value.max_tokens !== "number"
    || !Number.isInteger(value.max_tokens)
    || value.max_tokens <= 0
    || !Array.isArray(value.messages)
  ) {
    throw new LocalServiceRequestError(422, "Anthropic message request is invalid.");
  }
  if (value.stream === true) {
    throw new LocalServiceRequestError(422, "Streaming is not supported by this fixture.");
  }

  return {
    model: value.model,
    maxTokens: value.max_tokens,
    messageCount: value.messages.length,
    hasSystem: value.system !== undefined,
  };
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`).pathname;
}

async function createFixtureMessage(
  request: IncomingMessage,
  response: ServerResponse,
  evidencePath: string,
  captureId: string,
): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
  if (contentType !== JSON_CONTENT_TYPE) {
    throw new LocalServiceRequestError(415, "Content-Type must be application/json.");
  }

  const requestMetadata = parseAnthropicRequest(await readJsonBody(request));
  await appendJsonLine(evidencePath, {
    kind: "anthropic-message",
    captureId,
    capturedAt: new Date().toISOString(),
    fixture: "gbp-posts",
    request: requestMetadata,
  });
  writeJson(response, 200, createGbpPostAnthropicFixture());
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  evidencePath: string,
  nextCaptureId: () => string,
): Promise<void> {
  const path = requestPath(request);
  if (request.method === "GET" && path === HEALTH_PATH) {
    writeJson(response, 200, { status: "ok", service: "anthropic-fixture" });
    return;
  }
  if (request.method === "POST" && path === MESSAGES_PATH) {
    await createFixtureMessage(request, response, evidencePath, nextCaptureId());
    return;
  }
  writeJson(response, 404, { error: "Not found." });
}

function handleRequestFailure(response: ServerResponse, error: unknown): void {
  const requestError = error instanceof LocalServiceRequestError ? error : null;
  logger.error(
    {
      service: "anthropic-fixture",
      errorType: error instanceof Error ? error.name : "UnknownError",
    },
    "Local Anthropic fixture request failed.",
  );
  if (response.headersSent) {
    response.destroy();
    return;
  }
  writeJson(response, requestError?.statusCode ?? 500, {
    error: requestError?.publicMessage ?? "Anthropic fixture request failed.",
  });
}

export async function startAnthropicFixtureService(
  options: AnthropicFixtureServiceOptions,
): Promise<AnthropicFixtureServiceHandle> {
  await prepareJsonlEvidence(options.evidencePath);
  let captureSequence = 0;
  const nextCaptureId = (): string => {
    captureSequence += 1;
    return `anthropic-capture-${String(captureSequence).padStart(4, "0")}`;
  };
  const server = createServer((request, response) => {
    void handleRequest(request, response, options.evidencePath, nextCaptureId).catch(
      (error: unknown) => handleRequestFailure(response, error),
    );
  });
  const port = await listenOnLoopback(server);
  const origin = `http://${LOOPBACK_HOST}:${port}`;

  return {
    host: LOOPBACK_HOST,
    port,
    origin,
    baseUrl: origin,
    healthUrl: `${origin}${HEALTH_PATH}`,
    evidencePath: options.evidencePath,
    close: () => closeHttpServer(server),
  };
}
