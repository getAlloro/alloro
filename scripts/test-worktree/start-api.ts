import { createServer, type Server } from "node:http";
import { chmod, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const LOOPBACK_HOST = "127.0.0.1";

interface ApiReady {
  host: typeof LOOPBACK_HOST;
  port: number;
  pid: number;
  healthUrl: string;
}

function requireReadyPath(): string {
  const readyPath = process.env.ALLORO_WORKTREE_API_READY_FILE;
  if (!readyPath || !path.isAbsolute(readyPath)) {
    throw new Error("ALLORO_WORKTREE_API_READY_FILE must be an absolute path.");
  }
  return readyPath;
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

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = (): void => {
      server.off("error", handleError);
      const address = server.address();
      if (!address || typeof address === "string" || address.address !== LOOPBACK_HOST) {
        reject(new Error("Worktree API did not bind to IPv4 loopback."));
        return;
      }
      resolve(address.port);
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(0, LOOPBACK_HOST);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeIdleConnections();
  });
}

async function main(): Promise<void> {
  if (process.env.ALLORO_WORKTREE_TEST_MODE !== "true") {
    throw new Error("ALLORO_WORKTREE_TEST_MODE=true is required.");
  }

  const readyPath = requireReadyPath();
  const [{ default: app }, database] = await Promise.all([
    import("../../src/app"),
    import("../../src/database/connection"),
  ]);
  if (!(await database.testConnection())) {
    throw new Error("Worktree API database connection failed.");
  }

  const server = createServer(app);
  const port = await listen(server);
  const ready: ApiReady = {
    host: LOOPBACK_HOST,
    port,
    pid: process.pid,
    healthUrl: `http://${LOOPBACK_HOST}:${port}/api/health/db`,
  };
  await writePrivateJson(readyPath, ready);

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (): Promise<void> => {
    shutdownPromise ??= Promise.all([
      closeServer(server),
      database.closeConnection(),
    ]).then(() => undefined);
    return shutdownPromise;
  };
  const handleSignal = (): void => {
    void shutdown().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
