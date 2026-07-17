import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readRuntimeManifest,
  validateRuntimeManifest,
  writeRuntimeManifest,
} from "./util.manifest";
import {
  WORKTREE_MANIFEST_VERSION,
  type RuntimeManifest,
} from "../types";
import { composeProjectName } from "../config";

const temporaryPaths: string[] = [];

function manifest(filePath: string): RuntimeManifest {
  return {
    schemaVersion: WORKTREE_MANIFEST_VERSION,
    runtimeId: "feature-123456789abc",
    status: "ready",
    createdAt: "2026-07-17T00:00:00.000Z",
    worktree: {
      worktreePath: "/tmp/alloro-worktree",
      gitDir: "/tmp/repo/.git/worktrees/feature",
      commonDir: "/tmp/repo/.git",
      branch: "codex/feature",
      isDetached: false,
      head: "0123456789abcdef",
      isDirty: false,
    },
    fixture: "baseline",
    appOrigin: "http://feature.localhost:4567",
    authenticatedBootstrapUrl: "http://feature.localhost:4567/__worktree/bootstrap",
    healthUrl: "http://feature.localhost:4567/api/health/db",
    ports: {
      api: 4001,
      web: 4002,
      postgres: 4003,
      redis: 4004,
      emailCapture: 4005,
      anthropicFixture: 4006,
    },
    dependencies: [],
    safety: {
      database: "local-disposable",
      email: "local-capture",
      queue: "isolated-container",
      workers: [],
      recurringSchedules: false,
      externalWrites: "disabled",
      environment: "allowlisted",
    },
    logs: {
      supervisor: "/tmp/supervisor.log",
      api: "/tmp/api.log",
      web: "/tmp/web.log",
      emailCapture: "/tmp/email.log",
      anthropicFixture: "/tmp/anthropic.log",
      worker: null,
    },
    manifestPath: filePath,
    stopCommand: "npm run test:worktree -- stop --manifest /tmp/manifest.json",
    supervisorPid: 1234,
    composeProject: composeProjectName("feature-123456789abc"),
    keep: false,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((temporaryPath) =>
      rm(temporaryPath, { recursive: true, force: true }),
    ),
  );
});

describe("runtime manifest", () => {
  it("writes atomically with private permissions and reads the same value", async () => {
    const temporaryPath = await mkdtemp(path.join(os.tmpdir(), "alloro-manifest-"));
    temporaryPaths.push(temporaryPath);
    const filePath = path.join(temporaryPath, "manifest.json");
    const expected = manifest(filePath);

    await writeRuntimeManifest(filePath, expected);

    expect(await readRuntimeManifest(filePath)).toEqual(expected);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
    expect(await readFile(filePath, "utf8")).not.toContain("token");
  });

  it("rejects unknown schema versions and incomplete objects", () => {
    expect(() => validateRuntimeManifest({ schemaVersion: 99 })).toThrow(
      "Unsupported runtime manifest version",
    );
    expect(() =>
      validateRuntimeManifest({ schemaVersion: WORKTREE_MANIFEST_VERSION }),
    ).toThrow('field "runtimeId"');
  });

  it("rejects a compose project that does not belong to the runtime", () => {
    const value = manifest("/tmp/manifest.json");
    value.composeProject = "unrelated-project";

    expect(() => validateRuntimeManifest(value)).toThrow(
      "composeProject does not match",
    );
  });
});
