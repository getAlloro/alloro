import { apiGet, apiPost, apiPut, apiDelete } from "../index";
import type { PlatformCredential } from "./types";

// ─── Portal Keys ─────────────────────────────────────────────────

export async function generateMindPortalKey(
  mindId: string,
): Promise<string | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/portal-key`,
  });
  return res.success ? res.data.portal_key : null;
}

export async function generateSkillPortalKey(
  mindId: string,
  skillId: string,
): Promise<string | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/portal-key`,
  });
  return res.success ? res.data.portal_key : null;
}

// ─── Test Portals ────────────────────────────────────────────────

export async function testMindPortal(
  mindId: string,
  query: string,
): Promise<{ response: string; tokens_used: number } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/test-portal`,
    passedData: { query },
  });
  return res.success ? res.data : null;
}

export async function testSkillPortal(
  mindId: string,
  skillId: string,
  query: string,
): Promise<{ response: string; context: { approved_count: number; rejected_count: number } } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/test-portal`,
    passedData: { query },
  });
  return res.success ? res.data : null;
}

// ─── Platform Credentials ────────────────────────────────────────

export async function listCredentials(
  mindId: string,
): Promise<PlatformCredential[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/credentials` });
  return res.success ? res.data : [];
}

export async function createCredential(
  mindId: string,
  platform: string,
  credentials: string,
  label?: string,
): Promise<PlatformCredential | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/credentials`,
    passedData: { platform, credentials, label },
  });
  return res.success ? res.data : null;
}

export async function updateCredential(
  mindId: string,
  credentialId: string,
  updates: { label?: string; status?: string },
): Promise<boolean> {
  const res = await apiPut({
    path: `/admin/minds/${mindId}/credentials/${credentialId}`,
    passedData: updates,
  });
  return !!res.success;
}

export async function deleteCredential(
  mindId: string,
  credentialId: string,
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/credentials/${credentialId}`,
  });
  return !!res.success;
}

export async function revokeCredential(
  mindId: string,
  credentialId: string,
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/credentials/${credentialId}/revoke`,
  });
  return !!res.success;
}
