export type WarmupStatus = "queued" | "running" | "ready" | "failed";

export type ProjectIdentityRecord = Record<string, any> & {
  version?: number;
  last_updated_at?: string;
  warmed_up_at?: string;
  business?: {
    name?: string | null;
    place_id?: string | null;
    [key: string]: any;
  };
  brand?: {
    primary_color?: string | null;
    accent_color?: string | null;
    [key: string]: any;
  };
  meta?: {
    warmup_status?: WarmupStatus | string | null;
    [key: string]: any;
  };
};

export function parseProjectIdentity<T = ProjectIdentityRecord>(
  value: unknown,
): T | null {
  if (!value) return null;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export function createProjectIdentityShell(
  status?: WarmupStatus,
): ProjectIdentityRecord {
  const now = new Date().toISOString();
  return {
    version: 1,
    last_updated_at: now,
    meta: status ? { warmup_status: status } : {},
  };
}

export function prepareProjectIdentityForSave<T extends ProjectIdentityRecord>(
  identity: T,
): T {
  if (!identity.version) identity.version = 1;
  identity.last_updated_at = new Date().toISOString();
  return identity;
}

export function setProjectIdentityWarmupStatus<T extends ProjectIdentityRecord>(
  identity: T,
  status: WarmupStatus,
): T {
  identity.meta = { ...(identity.meta || {}), warmup_status: status };
  identity.last_updated_at = new Date().toISOString();
  if (!identity.version) identity.version = 1;
  return identity;
}

export function getProjectIdentityWarmupStatus(
  identity: ProjectIdentityRecord | null,
): WarmupStatus | null {
  const status = identity?.meta?.warmup_status;
  return status === "queued" ||
    status === "running" ||
    status === "ready" ||
    status === "failed"
    ? status
    : null;
}

export function getProjectIdentityBrandMirror(
  identity: ProjectIdentityRecord,
): { primary_color: string | null; accent_color: string | null } {
  return {
    primary_color: identity.brand?.primary_color || null,
    accent_color: identity.brand?.accent_color || null,
  };
}

type IdentityReadinessInput = {
  business?: {
    name?: string | null;
  };
  locations?: unknown;
} | null;

export function hasUsableIdentityForPageGeneration(
  identity: IdentityReadinessInput,
): identity is NonNullable<IdentityReadinessInput> {
  return (
    hasText(identity?.business?.name) ||
    hasUsableLocations(identity?.locations)
  );
}

export function hasUsableIdentityForLayoutGeneration(
  identity: IdentityReadinessInput,
): boolean {
  return hasUsableIdentityForPageGeneration(identity);
}

export function hasUsableIdentityForSlotGeneration(
  identity: IdentityReadinessInput,
): boolean {
  return hasUsableIdentityForPageGeneration(identity);
}

function hasUsableLocations(locations: unknown): boolean {
  return (
    Array.isArray(locations) &&
    locations.some((location) => {
      if (!location || typeof location !== "object") return false;
      const l = location as { name?: unknown; stale?: unknown };
      return l.stale !== true && hasText(l.name);
    })
  );
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
