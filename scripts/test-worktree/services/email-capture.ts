import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { N8nPayload } from "../../../src/emails/transport/n8nTransport";
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

const EMAIL_CAPTURE_PATH = "/email";
const HEALTH_PATH = "/health";
const JSON_CONTENT_TYPE = "application/json";

export interface EmailCaptureServiceOptions {
  evidencePath: string;
}

export interface EmailCaptureServiceHandle {
  host: typeof LOOPBACK_HOST;
  port: number;
  origin: string;
  webhookUrl: string;
  healthUrl: string;
  evidencePath: string;
  close: () => Promise<void>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseEmailPayload(value: unknown): N8nPayload {
  if (
    !isRecord(value)
    || typeof value.subject !== "string"
    || typeof value.body !== "string"
    || !isStringArray(value.recipients)
    || !isStringArray(value.cc)
    || !isStringArray(value.bcc)
    || typeof value.from !== "string"
    || typeof value.fromName !== "string"
  ) {
    throw new LocalServiceRequestError(422, "Email capture payload is invalid.");
  }

  return {
    subject: value.subject,
    body: value.body,
    recipients: value.recipients,
    cc: value.cc,
    bcc: value.bcc,
    from: value.from,
    fromName: value.fromName,
  };
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`).pathname;
}

async function captureEmail(
  request: IncomingMessage,
  response: ServerResponse,
  evidencePath: string,
  captureId: string,
): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
  if (contentType !== JSON_CONTENT_TYPE) {
    throw new LocalServiceRequestError(415, "Content-Type must be application/json.");
  }

  const payload = parseEmailPayload(await readJsonBody(request));
  await appendJsonLine(evidencePath, {
    kind: "email",
    captureId,
    capturedAt: new Date().toISOString(),
    payload,
  });
  writeJson(response, 202, {
    id: captureId,
    messageId: captureId,
    captured: true,
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  evidencePath: string,
  nextCaptureId: () => string,
): Promise<void> {
  const path = requestPath(request);
  if (request.method === "GET" && path === HEALTH_PATH) {
    writeJson(response, 200, { status: "ok", service: "email-capture" });
    return;
  }
  if (request.method === "POST" && path === EMAIL_CAPTURE_PATH) {
    await captureEmail(request, response, evidencePath, nextCaptureId());
    return;
  }
  writeJson(response, 404, { error: "Not found." });
}

function handleRequestFailure(response: ServerResponse, error: unknown): void {
  const requestError = error instanceof LocalServiceRequestError ? error : null;
  logger.error(
    {
      service: "email-capture",
      errorType: error instanceof Error ? error.name : "UnknownError",
    },
    "Local email capture request failed.",
  );
  if (response.headersSent) {
    response.destroy();
    return;
  }
  writeJson(response, requestError?.statusCode ?? 500, {
    error: requestError?.publicMessage ?? "Email capture failed.",
  });
}

export async function startEmailCaptureService(
  options: EmailCaptureServiceOptions,
): Promise<EmailCaptureServiceHandle> {
  await prepareJsonlEvidence(options.evidencePath);
  let captureSequence = 0;
  const nextCaptureId = (): string => {
    captureSequence += 1;
    return `email-capture-${String(captureSequence).padStart(4, "0")}`;
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
    webhookUrl: `${origin}${EMAIL_CAPTURE_PATH}`,
    healthUrl: `${origin}${HEALTH_PATH}`,
    evidencePath: options.evidencePath,
    close: () => closeHttpServer(server),
  };
}
