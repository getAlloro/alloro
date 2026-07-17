import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chmod, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "path";
import {
  createWorktreeBootstrapHtml,
} from "../scripts/test-worktree/feature-utils/util.bootstrap-html";

const LOOPBACK_HOST = "127.0.0.1";
const BOOTSTRAP_PATH = "/__worktree/bootstrap";

interface WorktreeViteEnvironment {
  runtimeId: string;
  hostname: string;
  webPort: number;
  tokenFile: string;
  readyFile: string;
  apiOrigin: string;
}

function requireAbsoluteEnvironmentPath(name: string): string {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path in worktree test mode.`);
  }
  return value;
}

function parseWorktreeEnvironment(): WorktreeViteEnvironment | null {
  if (process.env.ALLORO_WORKTREE_TEST_MODE !== "true") return null;

  const runtimeId = process.env.ALLORO_WORKTREE_RUNTIME_ID?.trim();
  const apiOrigin = process.env.ALLORO_WORKTREE_API_ORIGIN?.trim();
  if (!runtimeId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(runtimeId)) {
    throw new Error("ALLORO_WORKTREE_RUNTIME_ID is invalid.");
  }
  if (!apiOrigin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(apiOrigin)) {
    throw new Error("ALLORO_WORKTREE_API_ORIGIN must be an IPv4 loopback URL.");
  }
  const rawWebPort = process.env.ALLORO_WORKTREE_WEB_PORT;
  const webPort = rawWebPort && /^\d+$/.test(rawWebPort)
    ? Number(rawWebPort)
    : 0;
  if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65_535) {
    throw new Error("ALLORO_WORKTREE_WEB_PORT must be a valid TCP port.");
  }

  return {
    runtimeId,
    hostname: `${runtimeId}.localhost`,
    webPort,
    tokenFile: requireAbsoluteEnvironmentPath("ALLORO_WORKTREE_BOOTSTRAP_TOKEN_FILE"),
    readyFile: requireAbsoluteEnvironmentPath("ALLORO_WORKTREE_WEB_READY_FILE"),
    apiOrigin,
  };
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, filePath);
}

async function consumeBootstrapToken(tokenFile: string): Promise<string> {
  const consumingPath = `${tokenFile}.consuming`;
  await rename(tokenFile, consumingPath);
  try {
    const metadata = await stat(consumingPath);
    if ((metadata.mode & 0o077) !== 0) {
      throw new Error("Worktree bootstrap token file permissions are not private.");
    }
    if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
      throw new Error("Worktree bootstrap token file owner is invalid.");
    }
    return await readFile(consumingPath, "utf8");
  } finally {
    await unlink(consumingPath);
  }
}

function sendBootstrapFailure(
  response: ServerResponse,
  statusCode: number,
): void {
  const body = "This isolated bootstrap link is unavailable.";
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function worktreeRuntimePlugin(environment: WorktreeViteEnvironment): Plugin {
  return {
    name: "alloro-worktree-runtime",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(
          request.url ?? "/",
          `http://${environment.hostname}`,
        ).pathname;
        if (pathname !== BOOTSTRAP_PATH) {
          next();
          return;
        }
        if (request.method !== "GET") {
          sendBootstrapFailure(response, 405);
          return;
        }

        void consumeBootstrapToken(environment.tokenFile)
          .then((token) => {
            const body = createWorktreeBootstrapHtml(token.trim());
            response.writeHead(200, {
              "content-type": "text/html; charset=utf-8",
              "content-length": Buffer.byteLength(body),
              "cache-control": "no-store, no-cache, must-revalidate",
              pragma: "no-cache",
              "content-security-policy":
                "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
              "referrer-policy": "no-referrer",
              "x-content-type-options": "nosniff",
            });
            response.end(body);
          })
          .catch((error: unknown) => {
            const code = (error as NodeJS.ErrnoException).code;
            sendBootstrapFailure(response, code === "ENOENT" ? 410 : 500);
          });
      });

      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address() as AddressInfo | null;
        if (!address || address.address !== LOOPBACK_HOST) {
          server.config.logger.error("Worktree Vite server did not bind to loopback.");
          void server.close();
          return;
        }
        void writePrivateJson(environment.readyFile, {
          host: LOOPBACK_HOST,
          hostname: environment.hostname,
          port: address.port,
          pid: process.pid,
          origin: `http://${environment.hostname}:${address.port}`,
        }).catch((error: unknown) => {
          server.config.logger.error(
            `Could not write worktree Vite readiness: ${String(error)}`,
          );
          void server.close();
        });
      });
    },
  };
}

export default defineConfig(() => {
  const worktree = parseWorktreeEnvironment();

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(worktree ? [worktreeRuntimePlugin(worktree)] : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: worktree
      ? {
          host: LOOPBACK_HOST,
          port: worktree.webPort,
          strictPort: true,
          allowedHosts: [worktree.hostname],
          proxy: {
            "/api": {
              target: worktree.apiOrigin,
              changeOrigin: true,
              secure: false,
            },
          },
        }
      : {
          port: 5174,
          proxy: {
            "/api": {
              target: "http://localhost:3000",
              changeOrigin: true,
              secure: false,
            },
          },
        },
  };
});
