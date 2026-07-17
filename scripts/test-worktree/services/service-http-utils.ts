import { appendFile, chmod, mkdir } from "node:fs/promises";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import path from "node:path";

export const LOOPBACK_HOST = "127.0.0.1";
const MAX_REQUEST_BYTES = 1024 * 1024;

export class LocalServiceRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "LocalServiceRequestError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireAbsoluteEvidencePath(evidencePath: string): void {
  if (!evidencePath || !path.isAbsolute(evidencePath)) {
    throw new Error("Local capture evidence path must be absolute.");
  }
}

export async function prepareJsonlEvidence(evidencePath: string): Promise<void> {
  requireAbsoluteEvidencePath(evidencePath);
  await mkdir(path.dirname(evidencePath), { recursive: true, mode: 0o700 });
  await appendFile(evidencePath, "", { encoding: "utf8", mode: 0o600 });
  await chmod(evidencePath, 0o600);
}

export async function appendJsonLine(
  evidencePath: string,
  value: Record<string, unknown>,
): Promise<void> {
  await appendFile(evidencePath, `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let byteCount = 0;

  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteCount += buffer.byteLength;
      if (byteCount > MAX_REQUEST_BYTES) {
        request.resume();
        throw new LocalServiceRequestError(413, "Request body is too large.");
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof LocalServiceRequestError) throw error;
    throw new LocalServiceRequestError(400, "Request body could not be read.");
  }

  if (chunks.length === 0) {
    throw new LocalServiceRequestError(400, "A JSON request body is required.");
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new LocalServiceRequestError(400, "Request body must be valid JSON.");
  }
}

export function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

export async function listenOnLoopback(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = (): void => {
      server.off("error", handleError);
      const address = server.address();
      if (!address || typeof address === "string" || address.address !== LOOPBACK_HOST) {
        reject(new Error("Local capture service did not bind to IPv4 loopback."));
        return;
      }
      resolve(address.port);
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(0, LOOPBACK_HOST);
  });
}

export async function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
