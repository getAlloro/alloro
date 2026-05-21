# Canvas Inline Content Editing

## Why
The editor should feel like a real page/content builder for routine edits: click text, type on the page, and save confidently. The current popover input is safer than AI prompts, but it still feels like editing a form floating over the website.

## What
Add a bounded canvas-editing mode for text, headings, paragraphs, links, and button labels using direct in-iframe editing. Keep property controls for links, images, section backgrounds, font size, hide/show, and AI freeform edits, but make plain text changes happen directly on the selected page element.

## Context

**Relevant files:**
- `frontend/src/hooks/useIframeSelector.ts` — owns iframe event handling, injected selector CSS, selection metadata, selected labels, and action dispatch.
- `frontend/src/utils/editorDirectOperations.ts` — shared deterministic DOM mutation contract and operation allowlist.
- `frontend/src/components/PageEditor/InlineEditorPopover.tsx` — current in-canvas floating property editor; should become a toolbar/fallback, not the primary text editor.
- `frontend/src/components/PageEditor/InlineEditorControls.tsx` — shared inline icon/button primitives.
- `frontend/src/components/PageEditor/InlineEditorBackgroundControls.tsx` — section background property controls that remain toolbar-driven.
- `frontend/src/pages/admin/PageEditor.tsx` — admin page persistence through direct DOM mutation, section extraction, autosave, and publish.
- `frontend/src/pages/admin/LayoutEditor.tsx` — admin header/footer visual editing using the same selector/direct-operation contract.
- `frontend/src/pages/DFYWebsite.tsx` — client editor persistence through dirty state, undo/redo, save, publish, and user media API.
- `frontend/src/utils/htmlReplacer.ts` — extracts mutated sections and strips editor-only markers before persistence.
- `frontend/src/api/websiteMedia.ts` — admin/client media adapters already split by surface.

**Patterns to follow:**
- Mutate only the selected live iframe DOM element, then persist through existing `extractSectionsFromDom` and page save flows.
- Use the existing shared direct-operation utility instead of AI prompts for routine edits.
- Keep one shared editor contract across admin page editor, admin layout editor, and client DFY editor.
- Keep controls small and focused: selected element label plus compact floating toolbar.

**Reference file:** `frontend/src/utils/editorDirectOperations.ts` — closest existing analog for safe allowlisted editor operations.

## Constraints

**Must:**
- Enable direct canvas typing for selected text-like elements: headings, paragraphs, spans, list items, blockquotes, captions, links, and button/button-like labels.
- Use `contenteditable="plaintext-only"` where supported for phase one; fall back to safe plain `contenteditable` with paste sanitization where needed.
- Preserve `alloro-tpl-*` classes, `data-alloro-section`, shortcode wrappers/tokens, selected element identity, and existing section boundaries.
- Commit edits on blur or explicit apply, cancel/revert with Escape, and avoid committing empty text unless the existing element was already empty.
- Push undo/redo history before each committed text mutation.
- Persist through existing admin autosave and client save/dirty flows.
- Verify save still works after reload on admin page editor, admin layout editor, and client DFY editor.
- Keep image replacement, link href, font-size, hide/show, and background controls as property toolbar actions.
- Keep AI chat available for freeform edits, but not required for simple text edits.
- Keep mobile/desktop preview behavior stable.

**Must not:**
- Add section reorder.
- Add section delete.
- Add drag/drop layout editing.
- Add arbitrary HTML editing.
- Add arbitrary CSS/class/style text fields.
- Add rich text formatting in this pass.
- Add a new storage path, database schema, or backend route.
- Let normal page editing mutate header/footer; that stays in `LayoutEditor`.

**Out of scope:**
- Section library, add-section, reorder, delete, or duplicate.
- Full Webflow/Elementor-style layout designer.
- Rich text spans, bold/italic/list editing, or Tiptap integration inside page sections.
- Responsive breakpoint-specific styling.
- Global theme editor.
- Changing AI prompts or backend AI edit behavior.

## Risk

**Level:** 3

**Risks identified:**
- Native editing inside an iframe can fight the selector click/hover system. → **Mitigation:** introduce an explicit editing state that disables hover labels and narrows event handling while typing.
- `contenteditable` can inject unexpected markup on paste or browser commands. → **Mitigation:** use `plaintext-only` where supported, intercept paste/beforeinput, normalize to text content, and reject rich edits in phase one.
- Editing text directly can break buttons with nested icons/spans. → **Mitigation:** edit only a safe text target within the selected element; if the element has complex child structure, fall back to the current toolbar text input.
- Save can silently fail if DOM mutation does not re-extract the changed section. → **Mitigation:** every commit must run the same direct-operation path and verify section extraction changed the expected section before marking save successful.
- Admin/client drift can return if each page handles inline typing separately. → **Mitigation:** put edit-session state and commit/cancel helpers in shared PageEditor utilities/hooks, then wire each surface to the same callbacks.
- Blur-based commits can create accidental saves. → **Mitigation:** capture original text on edit start, commit only when text actually changes, and show unsaved/dirty state through existing UI.

**Blast radius:**
- Shared iframe selector behavior and injected CSS.
- Admin page editor selection, autosave, publish, undo history.
- Admin layout editor header/footer selection and save.
- Client DFY editor selection, dirty state, undo/redo, save, publish.
- Existing inline property popover and background controls.
- Direct DOM mutation utility and section extraction.

**Pushback:**
- This still should not become a layout builder. The user explicitly ruled out reorder/delete for now, and that is the right boundary. Content editing belongs on this architecture; layout editing needs a different component/source-of-truth model.
- Do not bolt rich text onto this first pass. Plain direct typing must be boring and reliable before adding formatting.

## Tasks

### T1: Editable Element Contract
**Do:** Define which selected elements can enter canvas edit mode and how their editable text node is resolved. Add availability metadata for direct canvas text editing and fallback-required cases.
**Files:** `frontend/src/hooks/useIframeSelector.ts`, `frontend/src/utils/editorDirectOperations.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`; manual: simple heading/paragraph/button/link selections report editable, complex nested selections fall back.

### T2: Shared Canvas Text Edit Session
**Do:** Add shared edit-session logic for start, commit, cancel, restore original text, paste sanitization, Enter/Escape behavior, and editing-state cleanup. Use plain text only.
**Files:** new `frontend/src/components/PageEditor/useCanvasTextEditSession.ts` or new `frontend/src/utils/canvasTextEditing.ts`, `frontend/src/hooks/useIframeSelector.ts`
**Depends on:** T1
**Verify:** Manual: double-click or edit action lets the user type directly in the selected canvas text; Escape reverts; blur/Enter commits.

### T3: Commit Through Existing Save Pipeline
**Do:** Route committed text through the existing direct mutation/extraction callbacks so admin autosave, client dirty state, undo/redo, and layout save behavior still work. Add guardrails so an unchanged edit does not create a history entry.
**Files:** `frontend/src/utils/editorDirectOperations.ts`, `frontend/src/pages/admin/PageEditor.tsx`, `frontend/src/pages/admin/LayoutEditor.tsx`, `frontend/src/pages/DFYWebsite.tsx`
**Depends on:** T1, T2
**Verify:** Manual: edit text, reload saved page/editor, confirm text persists on all three surfaces.

### T4: Toolbar Reposition And Fallback Behavior
**Do:** Convert `InlineEditorPopover` into a compact property toolbar while typing is direct on canvas. Keep fallback textarea only for complex elements where direct text editing is unsafe.
**Files:** `frontend/src/components/PageEditor/InlineEditorPopover.tsx`, `frontend/src/components/PageEditor/InlineEditorControls.tsx`, `frontend/src/components/PageEditor/InlineEditorBackgroundControls.tsx`
**Depends on:** T2, T3
**Verify:** Manual: selecting text does not cover the content with a large input; toolbar stays usable for font/link/media/background/hide controls.

### T5: Surface Integration Matrix
**Do:** Wire identical behavior into admin page editor, admin layout editor, and client DFY editor. Preserve page/header/footer boundaries and client media adapter behavior.
**Files:** `frontend/src/pages/admin/PageEditor.tsx`, `frontend/src/pages/admin/LayoutEditor.tsx`, `frontend/src/pages/DFYWebsite.tsx`, `frontend/src/api/websiteMedia.ts` if adapter typing needs tightening
**Depends on:** T3, T4
**Verify:** Manual: admin page text, admin header/footer text, and client page text can all be typed directly and saved.

### T6: Save And Regression Verification
**Do:** Verify the critical persistence paths: direct text edit, button label edit, link href edit, image replacement, section background edit, undo/redo, save, reload, and publish where available. Document any pre-existing lint debt separately.
**Files:** affected editor files
**Depends on:** T1-T5
**Verify:** `npx tsc --noEmit`; `cd frontend && npm run build`; targeted ESLint for touched files; browser matrix on admin page editor, admin layout editor, client DFY editor.

## Done
- [ ] Text/headings/paragraphs can be edited by typing directly on the canvas.
- [ ] Button/button-like labels can be edited directly when safe, with fallback for complex nested buttons.
- [ ] Link text can be edited directly and href remains toolbar-controlled with unsafe protocol validation.
- [ ] Existing image replacement and section background controls still work.
- [ ] No reorder, delete, drag/drop, arbitrary HTML, arbitrary CSS, or new storage path is introduced.
- [ ] Admin page editor saves the direct text edit and the edit persists after reload.
- [ ] Admin layout editor saves direct header/footer text and persists after reload.
- [ ] Client DFY editor marks dirty, saves direct text edits, and persists after reload.
- [ ] Undo/redo history works for committed direct text edits.
- [ ] Escape cancels an active canvas text edit without saving.
- [ ] Paste into editable text is plain text only.
- [ ] Unsupported/complex selections fall back cleanly to toolbar text input.
- [ ] `npx tsc --noEmit` passes or only pre-existing errors are documented.
- [ ] `cd frontend && npm run build` passes.
