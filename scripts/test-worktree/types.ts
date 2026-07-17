export const WORKTREE_MANIFEST_VERSION = 1;

export type FixtureProfile = "baseline" | "gbp-posts";

export interface WorktreeIdentity {
  worktreePath: string;
  gitDir: string;
  commonDir: string;
  branch: string | null;
  isDetached: boolean;
  head: string;
  isDirty: boolean;
}

export interface RuntimeRequest {
  runtimeId: string;
  runtimeDir: string;
  worktree: WorktreeIdentity;
  fixture: FixtureProfile;
  workers: string[];
  keep: boolean;
  createdAt: string;
}

export interface RuntimePorts {
  api: number;
  web: number;
  postgres: number;
  redis: number;
  emailCapture: number;
  anthropicFixture: number;
}

export interface RuntimeDependency {
  name: string;
  kind: "process" | "container";
  identifier: string;
}

export interface RuntimeSafety {
  database: "local-disposable";
  email: "local-capture";
  queue: "isolated-container";
  workers: string[];
  recurringSchedules: false;
  externalWrites: "disabled";
  environment: "allowlisted";
}

export interface RuntimeLogs {
  supervisor: string;
  api: string;
  web: string;
  emailCapture: string;
  anthropicFixture: string;
  worker: string | null;
}

export interface RuntimeManifest {
  schemaVersion: typeof WORKTREE_MANIFEST_VERSION;
  runtimeId: string;
  status: "ready";
  createdAt: string;
  worktree: WorktreeIdentity;
  fixture: FixtureProfile;
  appOrigin: string;
  authenticatedBootstrapUrl: string;
  healthUrl: string;
  ports: RuntimePorts;
  dependencies: RuntimeDependency[];
  safety: RuntimeSafety;
  logs: RuntimeLogs;
  manifestPath: string;
  stopCommand: string;
  supervisorPid: number;
  composeProject: string;
  keep: boolean;
}

export interface StartRuntimeOptions {
  fixture: FixtureProfile;
  workers: string[];
  keep: boolean;
}
