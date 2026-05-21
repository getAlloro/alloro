# Inline Editor Property Controls

## Why
The editor still feels like a chat panel with helper buttons, not a direct page editor. When a user selects text, buttons, images, or sections, the control should appear at the selected element itself and perform bounded deterministic edits.

## What
Add an in-canvas inline property editor anchored to the selected element for text/button label edits, link href edits, media replacement, and allowlisted background controls for selected sections. Keep the right sidebar for chat/history/debug, but make routine edits happen directly on the canvas.

## Context

**Relevant files:**
- `frontend/src/hooks/useIframeSelector.ts` — owns iframe selection labels, quick actions, inline action panel, and selection metadata.
- `frontend/src/utils/editorDirectOperations.ts` — shared deterministic DOM mutations for text, links, media, font size, and hide/show.
- `frontend/src/components/PageEditor/EditorSidebar.tsx` — current fallback control surface and AI chat container.
- `frontend/src/pages/admin/PageEditor.tsx` — admin page editor persistence through section extraction/autosave/publish.
- `frontend/src/pages/admin/LayoutEditor.tsx` — admin header/footer visual editor using the same selector/sidebar contract.
- `frontend/src/pages/DFYWebsite.tsx` — client-facing editor persistence through dirty state, save, publish, undo/redo.
- `frontend/src/components/PageEditor/MediaBrowser.tsx` — safe media picker already wired through admin/user media adapters.
- `frontend/src/utils/htmlReplacer.ts` — section extraction and editor marker cleanup after DOM mutation.

**Patterns to follow:**
- Extend the existing selected-element direct operation contract instead of adding AI prompts.
- Persist through existing DOM mutation → `extractSectionsFromDom`/layout marker extraction → save/publish flows.
- Keep controls shared so admin page, admin layout, and DFY editor behavior do not drift.

**Reference file:** `frontend/src/utils/editorDirectOperations.ts` — closest analog for adding bounded DOM operations and operation availability.

## Constraints

**Must:**
- Show a real input/textarea at or near the selected text/button element, prefilled with the current text.
- Support button-like links the same way: label edit plus href edit when the selected element is an anchor.
- Support image replacement through the existing safe media picker.
- Support selected section background controls: set color, clear/transparent, set background image from media, clear background image, and basic background fit/position presets.
- Keep operations deterministic and persisted through the existing editor save models.
- Preserve selection outlines, `alloro-tpl-*` classes, `data-alloro-section`, shortcodes, and undo/redo history.
- Keep controls keyboard usable: Enter/apply where appropriate, Escape/cancel, visible focus state.

**Must not:**
- Add arbitrary HTML editing, arbitrary CSS editing, custom class text fields, or raw style strings.
- Add drag/drop, section reorder, section delete, spacing/layout controls, or full WYSIWYG rich text.
- Let section background controls mutate header/footer from the normal page editor.
- Add another storage path or backend schema.
- Hide the AI chat entirely; freeform AI editing remains available in the sidebar.

**Out of scope:**
- Rich text spans inside a heading/paragraph.
- Global theme editor.
- Background gradients beyond predefined/simple color/image choices.
- Overlay management beyond safe clear/transparent/background image operations.
- Responsive per-breakpoint styling.

## Risk

**Level:** 3

**Risks identified:**
- In-canvas controls can intercept iframe selection/navigation events and make the editor feel broken. → **Mitigation:** keep the popover in the existing editor overlay layer, stop propagation only inside controls, and preserve click-outside selection behavior.
- Background mutation can damage page layout if arbitrary style editing is allowed. → **Mitigation:** allowlist only `background-color`, `background-image`, `background-size`, `background-position`, and clear operations.
- Text inputs can destroy nested markup/icons if applied to complex buttons. → **Mitigation:** only expose direct text for allowlisted text/button/link elements and document that the first pass replaces text content, not nested rich markup.
- Admin/client drift is likely if each page owns its own editor UI. → **Mitigation:** implement one shared inline property popover/operation contract consumed by all three editor surfaces.
- Persisted inline styles may fight template classes. → **Mitigation:** prefer clearing specific background properties over broad `style` removal and verify persisted HTML after save/reload.

**Blast radius:**
- Admin page editor selection and autosave/publish.
- Admin layout editor header/footer selection and save.
- Client DFY editor selection, undo/redo, dirty state, save/publish.
- Shared iframe selector overlays.
- Shared direct operation utility and media picker.
- Section extraction and editor marker cleanup.

**Pushback:**
- “Add background, transparent, etc.” can turn into an unbounded style panel fast. Future-us will hate that. This pass should be a controlled property editor, not a mini Webflow clone.
- If users need arbitrary layout/styling, that belongs in a separate page-builder design with stronger template contracts and visual QA.

## Tasks

### T1: Selection Metadata And Availability
**Do:** Extend selected element metadata and operation availability for inline editing: current text value, href, media eligibility, section background state, and section-safe background control availability.
**Files:** `frontend/src/hooks/useIframeSelector.ts`, `frontend/src/utils/editorDirectOperations.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`; manual: selected text/link/image/section expose the right availability state.

### T2: Shared Inline Property Popover
**Do:** Create a shared in-canvas property popover anchored to the selected element. Include textarea/input controls for text/button labels, href input for links, icon controls for font size/hide/show, and media/background actions where available.
**Files:** new `frontend/src/components/PageEditor/InlineEditorPopover.tsx`, `frontend/src/hooks/useIframeSelector.ts`, related CSS/utility files if needed
**Depends on:** T1
**Verify:** Manual: selecting a heading/button shows an editable field on the canvas without using the chat prompt.

### T3: Background Direct Operations
**Do:** Add direct operations for selected sections: set/clear background color, set/clear background image from media, set background size preset, and set background position preset. Clear/transparent must remove or neutralize only background properties.
**Files:** `frontend/src/utils/editorDirectOperations.ts`, `frontend/src/components/PageEditor/InlineEditorPopover.tsx`
**Depends on:** T1, T2
**Verify:** Manual: selected section background color/image changes persist and can be cleared.

### T4: Surface Integration
**Do:** Wire the shared popover operations into admin `PageEditor`, admin `LayoutEditor`, and client `DFYWebsite` using the existing direct-operation handlers, undo/redo/history, section extraction, and dirty/autosave behavior.
**Files:** `frontend/src/pages/admin/PageEditor.tsx`, `frontend/src/pages/admin/LayoutEditor.tsx`, `frontend/src/pages/DFYWebsite.tsx`
**Depends on:** T2, T3
**Verify:** Manual: inline text, button text, href, image replacement, and section backgrounds persist on all applicable surfaces.

### T5: Sidebar Cleanup And Fallback
**Do:** Keep the sidebar chat/history/debug surfaces, but stop presenting the chat prompt as the primary control for selected text. The sidebar can mirror current selected-state controls or stay secondary, but the in-canvas editor is the default.
**Files:** `frontend/src/components/PageEditor/EditorSidebar.tsx`, `frontend/src/components/PageEditor/ChatPanel.tsx` if needed
**Depends on:** T2, T4
**Verify:** Manual: selected text does not force the user into a chat-first workflow.

### T6: Verification Matrix
**Do:** Verify direct operations across desktop and mobile preview widths, with unsupported selections disabled instead of hidden failure states.
**Files:** affected editor files
**Depends on:** T1-T5
**Verify:** `npx tsc --noEmit`; targeted lint for touched files; manual browser matrix on admin page editor, admin layout editor, and DFY client editor.

## Done
- [ ] Selecting text shows an in-canvas real input/textarea prefilled with current text.
- [ ] Selecting a button/link supports direct label editing and href editing where applicable.
- [ ] Selecting an image supports media replacement from the safe media picker.
- [ ] Selecting a section supports allowlisted background color/image controls and clear/transparent behavior.
- [ ] Background operations persist after save/reload and do not remove section/template markers.
- [ ] Header/footer boundaries remain protected in the normal page editor.
- [ ] AI chat remains available for freeform edits but is not required for routine text/button/background changes.
- [ ] No arbitrary HTML, arbitrary CSS, section restructure, or new storage path is introduced.
- [ ] `npx tsc --noEmit` passes or only pre-existing errors are documented.
