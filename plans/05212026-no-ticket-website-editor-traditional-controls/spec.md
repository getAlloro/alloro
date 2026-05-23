# Website Editor Traditional Controls

## Why
The website page editor exposes traditional-looking controls for text, links, media, hide/show, and font sizing, but several of those operations still route through AI prompts or are only partially wired on one surface. Basic deterministic page edits should be direct, bounded DOM mutations with clear persistence, while AI remains available for freeform rewriting.

## What
Implement shared, deterministic editor operations for admin and client-facing page editors: inline text replacement, link href/text edits, photo replacement through the safe media selector/upload boundary, font-size controls, hide/show, undo/redo integration, and save/publish persistence without allowing users to restructure or destroy pages.

## Context

**Relevant files:**
- `frontend/src/pages/admin/PageEditor.tsx` — admin iframe editor, draft state, autosave, publish flow.
- `frontend/src/pages/admin/LayoutEditor.tsx` — admin header/footer iframe editor using the shared sidebar and selector.
- `frontend/src/pages/DFYWebsite.tsx` — client-facing iframe editor, dirty state, version/history, save and publish flow.
- `frontend/src/hooks/useIframeSelector.ts` — selection state, quick actions, component metadata, font-size handling.
- `frontend/src/components/PageEditor/EditorSidebar.tsx` — visible controls for text, link, media, hide, and font size.
- `frontend/src/components/PageEditor/ChatPanel.tsx` — chat/history/media upload UI shared by editor surfaces.
- `frontend/src/components/PageEditor/MediaBrowser.tsx` — media picker shared by editor surfaces.
- `frontend/src/utils/htmlReplacer.ts` — DOM replacement, section extraction, shortcode restoration, editor attribute cleanup.
- `frontend/src/utils/templateRenderer.ts` — renders page HTML with editor markers and section attributes.
- `src/controllers/admin-websites/feature-services/service.page-editor.ts` — admin AI edit service, left intact for freeform edits.
- `src/controllers/user-website/user-website-services/userWebsite.service.ts` — client AI edit service, left intact for freeform edits.

**Patterns to follow:**
- Persist edited page content through the existing section extraction/save flows, not a new page storage path.
- Keep direct editor mutations inside shared frontend editor utilities/components so admin and client do not drift.
- Preserve `alloro-tpl-*`, `data-alloro-section`, shortcode handling, and section identity.

**Reference file:** `frontend/src/pages/DFYWebsite.tsx` — existing direct font-size quick action flow and client save/publish contract.

## Constraints

**Must:**
- Keep freeform AI editing available, but stop using AI for simple text/link/media replacements.
- Use deterministic DOM operations for selected editable elements.
- Preserve page structure, sections, shortcode placeholders, and editor marker attributes.
- Integrate with each surface's existing save model: admin draft/autosave and client dirty/save/publish.
- Use the media API adapter from `plans/05212026-no-ticket-website-editor-media-boundary-hardening/` for photo replacement.
- Provide clear disabled states when the selection does not support a given operation.
- Keep header/footer and non-page-template content protected according to the current editor boundaries.

**Must not:**
- Allow arbitrary HTML editing from the sidebar.
- Allow section reordering, deletion, or page layout restructuring.
- Add a second persistence path outside existing page section updates.
- Add new AI prompts for deterministic edits.
- Add broad style editing beyond the agreed basic operations.
- Treat admin and client editors as separate feature implementations.

**Out of scope:**
- Full WYSIWYG rich text editor.
- Drag-and-drop sections.
- Global theme editing.
- New media library design.
- AI prompt tuning beyond keeping existing freeform chat working.
- Backend schema changes.

## Risk

**Level:** 3

**Risks identified:**
- Direct DOM mutation can corrupt persisted page sections if it strips markers, shortcodes, or section boundaries. → **Mitigation:** route every mutation through a shared utility and verify output with `extractSectionsFromDom`.
- Admin and client editor behavior can drift if each page implements controls separately. → **Mitigation:** define a shared operation contract used by both surfaces.
- Media replacement depends on the unsafe media boundary being fixed first. → **Mitigation:** make this spec depend on the media-boundary spec and do not wire photo replacement to admin endpoints.
- Link editing can create unsafe URLs. → **Mitigation:** validate href protocols and normalize internal/relative links before writing to the DOM.
- Hide/show can make content appear lost if there is no recovery path. → **Mitigation:** keep hidden elements selectable/recoverable in editor mode and expose show/unhide when a hidden element is selected.

**Blast radius:**
- Admin page editor selection, undo/redo, autosave, publish.
- Admin layout editor selection and header/footer content persistence.
- Client DFY editor selection, dirty state, version history, save/publish.
- Shared page editor sidebar, chat panel, and media browser.
- Page HTML section extraction and renderer marker behavior.
- Existing AI edit flows, which should remain available for freeform edits only.

**Pushback:**
- This should not become a mini page builder. The right scope is bounded edits to existing editable elements. Section restructuring belongs in a separate design because it has a much larger persistence and QA surface.
- Do not keep wrapping simple edits in AI prompts. That is slower, less predictable, more expensive, and worse for user trust.

## Tasks

### T1: Shared Direct Edit Contract
**Do:** Define shared editor operations for selected elements: text replace, link update, media replace, font size step, hide, show, and operation availability.
**Files:** `frontend/src/hooks/useIframeSelector.ts`, new or existing shared editor utility files
**Depends on:** none
**Verify:** `npx tsc --noEmit`; manual: operation availability reflects selected element type.

### T2: Sidebar Control Wiring
**Do:** Update `EditorSidebar` so text/link/media/font/hide/show controls call deterministic operation callbacks instead of generating AI instructions.
**Files:** `frontend/src/components/PageEditor/EditorSidebar.tsx`, related page editor component props
**Depends on:** T1
**Verify:** Manual: using a basic control does not send an AI edit request.

### T3: Admin Editor Integration
**Do:** Wire direct operations into admin `PageEditor`, push prior HTML into undo history, extract updated sections, preserve autosave/publish behavior, and keep AI chat for freeform edits.
**Files:** `frontend/src/pages/admin/PageEditor.tsx`, shared editor utility files as needed
**Depends on:** T1, T2
**Verify:** Manual: edit text, edit link, replace image, adjust font size, hide/show, undo, save, publish in admin editor.

### T4: Admin Layout Editor Integration
**Do:** Wire the same direct operations into admin `LayoutEditor` because it shares the sidebar/selector contract for header/footer editing.
**Files:** `frontend/src/pages/admin/LayoutEditor.tsx`, shared editor utility files as needed
**Depends on:** T1, T2
**Verify:** Manual: edit header/footer text, links, media, font size, and hide/show without calling AI.

### T5: Client Editor Integration
**Do:** Wire direct operations into `DFYWebsite`, mark pages dirty, preserve version/history behavior, and save/publish through the existing client page section endpoint.
**Files:** `frontend/src/pages/DFYWebsite.tsx`, shared editor utility files as needed
**Depends on:** T1, T2
**Verify:** Manual: same direct edit matrix works in the client-facing editor and persists after reload.

### T6: Media Replacement
**Do:** Use the media adapter from the boundary-hardening spec to replace selected images/media, update `src`, `srcset`/responsive attributes where applicable, and preserve alt text behavior.
**Files:** `frontend/src/components/PageEditor/MediaBrowser.tsx`, `frontend/src/components/PageEditor/ChatPanel.tsx`, editor parent pages
**Depends on:** T1, T2, `plans/05212026-no-ticket-website-editor-media-boundary-hardening/`
**Verify:** Manual: upload/select media and replace a selected image in both admin and client editors without calling admin endpoints from the client.

### T7: Verification Matrix
**Do:** Run typecheck and manually verify basic operations across admin and client editor surfaces, including blocked cases for unsupported selections.
**Files:** affected frontend editor files
**Depends on:** T3, T4, T5, T6
**Verify:** `npx tsc --noEmit`; manual browser matrix.

## Revision Log

### Rev 1 — 2026-05-21
**Change:** Added `LayoutEditor` to the implementation scope because it is a real shared consumer of `EditorSidebar` and `useIframeSelector`.
**Reason:** Ignoring it would leave header/footer editing on the old AI-backed behavior while changing the shared sidebar contract.
**Updated Done criteria:** The direct operation contract must work for admin page, admin layout, and client DFY editor surfaces.

## Done
- [ ] Text replacement is deterministic and persists in admin and client editors.
- [ ] Link href/text editing is deterministic, validates unsafe protocols, and persists.
- [ ] Photo replacement uses the safe media selector/upload boundary and persists.
- [ ] Font-size increase/decrease persists in admin and client editors.
- [ ] Hide and show operations work without making content unrecoverable in editor mode.
- [ ] Freeform AI chat/editing remains available for non-basic edits.
- [ ] Client editor basic controls do not call admin routes.
- [ ] No section restructuring, arbitrary HTML editing, or new storage path is introduced.
- [ ] `npx tsc --noEmit` passes or only pre-existing errors are documented.
