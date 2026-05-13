# Media Upload Limit Error Handling

## Why
Website project media uploads failed with `MulterError: File too large`, and the UI surfaced a JSON parse error from an HTML fallback instead of a useful upload message.

## What
Increase admin website media upload size handling to 500 MB per file and show readable upload errors in the media tab and editor chat upload surface.

## Constraints
**Must:**
- Keep the existing admin media endpoint and S3-backed upload flow.
- Return JSON for Multer file-size failures before the request falls through to the frontend HTML proxy.
- Avoid unrelated ranking/worktree changes.

**Must not:**
- Add dependencies.
- Rewrite media storage or introduce multipart S3 upload in this quickfix.

**Out of scope:**
- Replacing Multer `memoryStorage()` with streaming/direct S3 multipart upload.
- Changing project storage quota behavior.

## Risk
**Level:** 2

**Risks identified:**
- 500 MB files are still buffered in Node memory by Multer `memoryStorage()` → **Mitigation:** keep the quickfix scoped, flag the long-term direct-to-S3/streaming replacement.
- Bulk upload still allows up to 20 files → **Mitigation:** preserve current count behavior but reject oversized files client-side and return JSON server-side.

**Blast radius:** admin website media upload route, admin media tab uploads, page editor chat media attachment uploads.

**Pushback:**
- This limit increase is useful, but the architecture is still not ideal for large videos. Streaming/direct S3 multipart belongs in a follow-up.

## Tasks

### T1: Raise media upload size and return JSON Multer errors
**Do:** Change admin media Multer limit to 500 MB per file and map Multer failures to JSON responses.
**Files:** `src/routes/admin/media.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Improve media upload error handling in the UI
**Do:** Add safe response parsing, client-side 500 MB checks, and readable inline upload errors for both media upload surfaces.
**Files:** `frontend/src/components/Admin/MediaTab.tsx`, `frontend/src/components/PageEditor/ChatPanel.tsx`
**Depends on:** T1
**Verify:** `npm run build`; `npx eslint src/components/Admin/MediaTab.tsx src/components/PageEditor/ChatPanel.tsx`

## Done
- [x] `npx tsc --noEmit` passes
- [x] `npm run build` passes in `frontend`
- [x] Targeted frontend ESLint has no new errors
- [x] Oversized upload handling shows a readable message instead of `Unexpected token '<'`
- [x] No unrelated ranking changes included
