import { apiDelete, apiGet, apiPatch, apiPost, apiPut, unwrap } from "./index";

/**
 * Admin OS knowledge base — API module (plans/07042026-alloro-os-admin-port).
 * All requests ride the shared client in api/index.ts (§12.1, §14.2); this
 * file only types the §8.1 envelope payloads and unwraps them via the shared
 * `unwrap` helper (§16.1 — failures throw an ApiError carrying the backend
 * error code, e.g. OS_LOCK_HELD / OS_VERSION_CONFLICT). Analog:
 * admin-mission-control.ts.
 */

// ── Shared shapes ────────────────────────────────────────────────────────────

export type AdminOsPingData = {
  pong: boolean;
  timestamp: string;
};

export type AdminOsUser = {
  id: number;
  email: string;
  name: string;
};

export type OsDocumentStatus =
  | "processing"
  | "indexed"
  | "archived"
  | "processing_failed";

export type OsPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type OsDocumentOwner = {
  id: number;
  name: string | null;
  email: string;
};

/** Row shape of os.documents as serialized over JSON (dates are ISO strings). */
export type OsDocument = {
  id: string;
  folder_id: string | null;
  title: string;
  slug: string;
  current_version_id: string | null;
  status: OsDocumentStatus;
  owner_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

/** List/detail row — document columns + AI taxonomy + joined owner. */
export type OsDocumentListItem = OsDocument & {
  category: string | null;
  tags: string[];
  owner: OsDocumentOwner | null;
};

export type OsTocEntry = {
  level: number;
  text: string;
  slug: string;
};

export type OsDocumentVersion = {
  id: string;
  document_id: string;
  version_no: number;
  title: string | null;
  content_md: string;
  toc_json: OsTocEntry[] | null;
  ai_change_summary: string | null;
  human_note: string | null;
  author_id: number | null;
  created_at: string;
};

export type OsDocumentDraft = {
  document_id: string;
  content_md: string;
  base_version: number | null;
  updated_by: number | null;
  updated_at: string;
};

export type OsDocumentLock = {
  document_id: string;
  locked_by: number;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
};

export type OsFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

export type OsFolderNode = OsFolder & {
  document_count: number;
  children: OsFolderNode[];
};

export type OsFolderTree = {
  tree: OsFolderNode[];
  folders: OsFolderNode[];
};

export type OsCategory = {
  id: string | null;
  name: string;
  source: "persisted" | "document";
  created_at: string | null;
  updated_at: string | null;
};

export type OsDiffHunkType = "context" | "add" | "remove";

export type OsDiffHunk = {
  type: OsDiffHunkType;
  text: string;
};

export type OsVersionDiff = {
  from: string;
  to: string;
  hunks: OsDiffHunk[];
};

export type OsSearchHit = {
  id: string;
  title: string;
  slug: string;
  status: OsDocumentStatus;
  folder_id: string | null;
  owner_id: number | null;
  updated_at: string;
  summary: string | null;
  category: string | null;
  tags: string[];
  rank: number;
  /** ts_headline snippet; matches are marked with <<…>>. */
  snippet: string;
};

/** A semantic (vector) hit — one chunk of a document, with its heading path. */
export type OsPassageHit = {
  document_id: string;
  title: string;
  slug: string;
  version_no: number;
  chunk_index: number;
  heading_path: string | null;
  similarity: number;
  snippet: string;
};

export type OsSearchMode = "hybrid" | "lexical" | "semantic";

/** GET /search response — the lexical (FTS) and semantic (vector) sections. */
export type OsHybridSearchData = {
  mode: OsSearchMode;
  lexical: { results: OsSearchHit[]; pagination: OsPagination };
  semantic: { results: OsPassageHit[] };
};

// ── Related links (P4) ───────────────────────────────────────────────────────

export type OsLinkOrigin = "manual" | "ai_suggested" | "content_parsed";
export type OsLinkStatus = "suggested" | "accepted" | "rejected";

/** One link edge as the Related rail renders it (the "other" document nested). */
export type OsLinkDto = {
  id: string;
  origin: string;
  status: OsLinkStatus;
  document: {
    id: string;
    title: string;
    status: string;
    archived: boolean;
  };
};

/** The Related rail payload: accepted out-links, backlinks, pending suggestions. */
export type OsLinksView = {
  links: OsLinkDto[];
  backlinks: OsLinkDto[];
  suggested: OsLinkDto[];
};

// ── Request params ───────────────────────────────────────────────────────────

export type OsDocumentListParams = {
  folderId?: string;
  status?: OsDocumentStatus;
  ownerId?: number;
  category?: string;
  tag?: string;
  page?: number;
  limit?: number;
};

export type OsUpdateMetaPatch = {
  folder_id?: string | null;
  owner_id?: number | null;
  category?: string | null;
  tags?: string[];
};

export type OsSearchParams = {
  folderId?: string;
  category?: string;
  tag?: string;
  ownerId?: number;
  status?: OsDocumentStatus;
  page?: number;
  limit?: number;
};

function buildQueryString(
  entries: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ── Ping + users (P1) ────────────────────────────────────────────────────────

export async function adminOsPing(): Promise<AdminOsPingData> {
  return unwrap<AdminOsPingData>(await apiGet({ path: "/admin/os/ping" }));
}

export async function adminOsListUsers(): Promise<AdminOsUser[]> {
  const data = unwrap<{ users: AdminOsUser[] }>(
    await apiGet({ path: "/admin/os/users" }),
  );
  return data.users;
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function adminOsListDocuments(
  params: OsDocumentListParams = {},
): Promise<{ documents: OsDocumentListItem[]; pagination: OsPagination }> {
  const qs = buildQueryString({
    folder_id: params.folderId,
    status: params.status,
    owner_id: params.ownerId,
    category: params.category,
    tag: params.tag,
    page: params.page,
    limit: params.limit,
  });
  return unwrap(await apiGet({ path: `/admin/os/documents${qs}` }));
}

export async function adminOsCreateDocument(input: {
  title: string;
  folder_id?: string | null;
  content_md?: string;
}): Promise<{ document: OsDocumentListItem }> {
  return unwrap(
    await apiPost({ path: "/admin/os/documents", passedData: input }),
  );
}

export async function adminOsGetDocument(documentId: string): Promise<{
  document: OsDocumentListItem;
  version: OsDocumentVersion | null;
}> {
  return unwrap(await apiGet({ path: `/admin/os/documents/${documentId}` }));
}

export async function adminOsRenameDocument(
  documentId: string,
  title: string,
): Promise<{ document: OsDocumentListItem }> {
  return unwrap(
    await apiPatch({
      path: `/admin/os/documents/${documentId}`,
      passedData: { title },
    }),
  );
}

/** Soft-archive into the trash (DELETE /documents/:id). */
export async function adminOsArchiveDocument(
  documentId: string,
): Promise<{ document: OsDocumentListItem }> {
  return unwrap(await apiDelete({ path: `/admin/os/documents/${documentId}` }));
}

export async function adminOsUpdateDocumentMeta(
  documentId: string,
  patch: OsUpdateMetaPatch,
): Promise<{ document: OsDocumentListItem }> {
  return unwrap(
    await apiPatch({
      path: `/admin/os/documents/${documentId}/meta`,
      passedData: patch,
    }),
  );
}

export async function adminOsGetDraft(
  documentId: string,
): Promise<{ draft: OsDocumentDraft }> {
  return unwrap(
    await apiGet({ path: `/admin/os/documents/${documentId}/draft` }),
  );
}

export async function adminOsSaveDraft(
  documentId: string,
  input: { content_md: string; base_version?: number | null },
): Promise<{ draft: OsDocumentDraft }> {
  return unwrap(
    await apiPut({
      path: `/admin/os/documents/${documentId}/draft`,
      passedData: input,
    }),
  );
}

export async function adminOsPublishDocument(
  documentId: string,
  input: { base_version: number; summary?: string | null; note?: string | null },
): Promise<{ version: OsDocumentVersion }> {
  return unwrap(
    await apiPost({
      path: `/admin/os/documents/${documentId}/publish`,
      passedData: input,
    }),
  );
}

export async function adminOsReindexDocument(
  documentId: string,
): Promise<{ queued: boolean; document: OsDocumentListItem }> {
  return unwrap(
    await apiPost({ path: `/admin/os/documents/${documentId}/reindex` }),
  );
}

// ── Versions ─────────────────────────────────────────────────────────────────

export async function adminOsListVersions(
  documentId: string,
  params: { page?: number; limit?: number } = {},
): Promise<{ versions: OsDocumentVersion[]; pagination: OsPagination }> {
  const qs = buildQueryString({ page: params.page, limit: params.limit });
  return unwrap(
    await apiGet({ path: `/admin/os/documents/${documentId}/versions${qs}` }),
  );
}

/** from/to accept a version number or the literal "draft" token. */
export async function adminOsDiffVersions(
  documentId: string,
  from: number | "draft",
  to: number | "draft",
): Promise<OsVersionDiff> {
  const qs = buildQueryString({ from: String(from), to: String(to) });
  return unwrap(
    await apiGet({
      path: `/admin/os/documents/${documentId}/versions/diff${qs}`,
    }),
  );
}

export async function adminOsGetVersion(
  documentId: string,
  versionNo: number,
): Promise<{ version: OsDocumentVersion }> {
  return unwrap(
    await apiGet({
      path: `/admin/os/documents/${documentId}/versions/${versionNo}`,
    }),
  );
}

/** Non-destructive restore: creates v(N+1) with v{versionNo}'s content. */
export async function adminOsRestoreVersion(
  documentId: string,
  versionNo: number,
): Promise<{ version: OsDocumentVersion }> {
  return unwrap(
    await apiPost({
      path: `/admin/os/documents/${documentId}/restore`,
      passedData: { version_no: versionNo },
    }),
  );
}

// ── Edit locks (D8: HTTP heartbeat) ──────────────────────────────────────────

export async function adminOsGetLock(
  documentId: string,
): Promise<{ lock: OsDocumentLock | null }> {
  return unwrap(
    await apiGet({ path: `/admin/os/documents/${documentId}/locks` }),
  );
}

export async function adminOsAcquireLock(
  documentId: string,
): Promise<{ lock: OsDocumentLock }> {
  return unwrap(
    await apiPost({ path: `/admin/os/documents/${documentId}/locks` }),
  );
}

export async function adminOsHeartbeatLock(
  documentId: string,
): Promise<{ lock: OsDocumentLock }> {
  return unwrap(
    await apiPost({
      path: `/admin/os/documents/${documentId}/locks/heartbeat`,
    }),
  );
}

export async function adminOsReleaseLock(
  documentId: string,
): Promise<{ released: boolean }> {
  return unwrap(
    await apiDelete({ path: `/admin/os/documents/${documentId}/locks` }),
  );
}

// ── Folders ──────────────────────────────────────────────────────────────────

export async function adminOsGetFolderTree(): Promise<OsFolderTree> {
  return unwrap(await apiGet({ path: "/admin/os/folders" }));
}

export async function adminOsCreateFolder(input: {
  name: string;
  parent_id?: string | null;
}): Promise<{ folder: OsFolder }> {
  return unwrap(await apiPost({ path: "/admin/os/folders", passedData: input }));
}

export async function adminOsUpdateFolder(
  folderId: string,
  patch: { name?: string; parent_id?: string | null },
): Promise<{ folder: OsFolder }> {
  return unwrap(
    await apiPatch({ path: `/admin/os/folders/${folderId}`, passedData: patch }),
  );
}

export async function adminOsDeleteFolder(
  folderId: string,
): Promise<{ deleted: true; documents_moved_to_root: number }> {
  return unwrap(await apiDelete({ path: `/admin/os/folders/${folderId}` }));
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function adminOsListCategories(): Promise<{
  categories: OsCategory[];
}> {
  return unwrap(await apiGet({ path: "/admin/os/categories" }));
}

export async function adminOsCreateCategory(
  name: string,
): Promise<{ category: OsCategory; created: boolean }> {
  return unwrap(
    await apiPost({ path: "/admin/os/categories", passedData: { name } }),
  );
}

// ── Trash ────────────────────────────────────────────────────────────────────

export async function adminOsListTrash(
  params: { page?: number; limit?: number } = {},
): Promise<{ documents: OsDocumentListItem[]; pagination: OsPagination }> {
  const qs = buildQueryString({ page: params.page, limit: params.limit });
  return unwrap(await apiGet({ path: `/admin/os/trash${qs}` }));
}

export async function adminOsRestoreFromTrash(
  documentId: string,
): Promise<{ document: OsDocumentListItem }> {
  return unwrap(
    await apiPost({ path: `/admin/os/trash/${documentId}/restore` }),
  );
}

/** Permanent delete — 202, purge job queued. */
export async function adminOsPurgeDocument(
  documentId: string,
): Promise<{ queued: true }> {
  return unwrap(await apiDelete({ path: `/admin/os/trash/${documentId}` }));
}

// ── Search (hybrid: lexical FTS + semantic vector) ───────────────────────────

export async function adminOsSearch(
  q: string,
  params: OsSearchParams & { mode?: OsSearchMode } = {},
): Promise<OsHybridSearchData> {
  const qs = buildQueryString({
    q,
    mode: params.mode,
    folder_id: params.folderId,
    category: params.category,
    tag: params.tag,
    owner_id: params.ownerId,
    status: params.status,
    page: params.page,
    limit: params.limit,
  });
  return unwrap(await apiGet({ path: `/admin/os/search${qs}` }));
}

// ── Related links (P4) ───────────────────────────────────────────────────────

export async function adminOsGetLinks(
  documentId: string,
): Promise<OsLinksView> {
  return unwrap(
    await apiGet({ path: `/admin/os/documents/${documentId}/links` }),
  );
}

/** Manual link source → target (created accepted). 409 if already linked. */
export async function adminOsCreateLink(
  documentId: string,
  targetDocumentId: string,
): Promise<{ link: OsLinkDto }> {
  return unwrap(
    await apiPost({
      path: `/admin/os/documents/${documentId}/links`,
      passedData: { target_document_id: targetDocumentId },
    }),
  );
}

/** Accept or reject a link (PATCH /links/:id). */
export async function adminOsUpdateLinkStatus(
  linkId: string,
  status: Extract<OsLinkStatus, "accepted" | "rejected">,
): Promise<{ link: { id: string; status: OsLinkStatus } }> {
  return unwrap(
    await apiPatch({
      path: `/admin/os/links/${linkId}`,
      passedData: { status },
    }),
  );
}
