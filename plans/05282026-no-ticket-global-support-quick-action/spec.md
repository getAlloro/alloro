# Global Support Quick Action

## Why
Creating a support ticket currently requires the user to navigate to `/help`, open the composer, pick a type, and manually attach context. A global quick action should let users report the exact page they are on with a captured screenshot already attached.

## What
Add a mobile-responsive floating support action in the bottom-right of protected client pages. The button uses a headphones/support icon, opens an animated menu with Bug Report, Website Edit, and Feature Request options, captures the current page as a screenshot, best-effort copies the image to the browser clipboard, redirects to `/help`, auto-opens the support composer with the selected type, and animates the screenshot thumbnail into the attachments area.

## Context

**Relevant files:**
- `frontend/src/App.tsx` - route layout and global component mounting point.
- `frontend/src/pages/Help.tsx` - owns support ticket list, composer open state, and create-ticket submission.
- `frontend/src/components/support/SupportTicketComposerModal.tsx` - modal wrapper for new ticket creation.
- `frontend/src/components/support/SupportTicketComposer.tsx` - owns ticket type, guided answers, and attachment state.
- `frontend/src/components/support/SupportTicketAttachmentPicker.tsx` - renders attachment selection/list UI.
- `frontend/src/components/support/supportMeta.ts` - existing ticket type labels/icons.
- `/Users/rustinedave/Desktop/alloro-docs/src/components/DesktopViewport.tsx` - shared docs replica viewport; best place to mirror a global floating control once.
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/support.ts` - support page docs steps/hotspots.

**Patterns to follow:**
- Keep support ticket creation through the existing `/help` composer and `useCreateSupportTicket` flow.
- Use React Router navigation plus app context for draft handoff; do not serialize screenshots into query params.
- Use Framer Motion for menu/capture/thumbnail motion, matching existing support modal animation style.
- Keep API calls inside existing support query hooks; this feature should not call support endpoints directly.

**Reference file:** `frontend/src/components/support/SupportTicketComposer.tsx` - closest analog for ticket type selection and attachment ownership.

## Constraints

**Must:**
- Show a fixed bottom-right support action on protected client pages, responsive on mobile and desktop.
- Use a support/headphones style icon for the collapsed action.
- Animate open a menu with exactly: Bug Report, Website Edit, Feature Request.
- Give each option its own icon and short purpose text.
- Capture a screenshot file before navigating away.
- Attach a timestamped text file with the current session's captured console logs when available.
- Best-effort copy the screenshot to the browser clipboard when supported.
- Redirect to `/help` and auto-open the existing support composer with the selected ticket type.
- Auto-attach the captured screenshot as a ticket attachment.
- Animate the captured screenshot thumbnail from the top into the attachments area.
- Exclude the floating support menu/animation itself from the captured screenshot.
- Preserve the normal New ticket button and existing manual attachment picker.

**Must not:**
- Create a parallel ticket creation flow outside `/help`.
- Add backend endpoints or change support attachment upload contracts.
- Depend on clipboard success for ticket attachment.
- Persist console logs across refreshes or send logs anywhere except the user-submitted support ticket attachment.
- Attach raw console output without basic redaction/capping for token/password-like values.
- Attempt an unprompted OS/browser-chrome screenshot; browser security does not allow that.
- Show the launcher on public auth pages unless explicitly chosen during execution after review.
- Touch unrelated rankings, GBP, pilot, or prior support-copy files beyond required integration points.

**Out of scope:**
- Native full-desktop screenshot capture.
- Persisting an in-progress draft across browser refresh.
- Admin support dashboard changes.
- A new backend screenshot service.

## Risk

**Level:** 3

**Risks identified:**
- Browser screenshot constraints: the web app cannot silently capture the OS screen or browser chrome. -> **Mitigation:** capture the app DOM/page viewport with a DOM screenshot library and document that this is a page screenshot, not a native screen recording.
- Clipboard writes can fail because of browser permissions, secure-context rules, or async user activation timing. -> **Mitigation:** treat clipboard write as best-effort; the reliable attachment path is the in-memory `File` handoff into the composer.
- New screenshot dependency increases bundle and capture complexity. -> **Mitigation:** add one focused DOM capture dependency (`html-to-image`), isolate it in a utility, and only load/use it from the support quick action path.
- Global floating UI can block page controls, especially on mobile. -> **Mitigation:** use safe-area-aware bottom/right spacing, compact sizing, keyboard-accessible menu behavior, and Playwright checks at desktop and mobile widths.
- Handoff state can drift if implemented through URL query params alone. -> **Mitigation:** use a typed support draft context for the `File`, with URL params only selecting/opening the composer.
- Console logs can accidentally include sensitive values. -> **Mitigation:** collect logs only in the current JS session, cap the retained entries and attachment size, and redact token/password/authorization-like substrings before creating the `.txt` file.
- Docs parity is easy to miss because this is a global control. -> **Mitigation:** add a shared docs viewport overlay for the global button and update Support docs copy/steps.

**Blast radius:**
- Protected client route layout in `App.tsx`.
- Support composer initial state and attachment rendering.
- Support page route/query behavior.
- Frontend bundle dependency set.
- Alloro Docs replica viewport.

**Pushback:**
- Do not make clipboard the transport. That turns a support workflow into a browser-permission lottery. The screenshot file belongs in app state until it is attached to the ticket.
- Do not put ticket creation in the floating button. It should capture context and route into the existing composer, where required fields and existing validation still apply.

## Tasks

### T1: Support quick-action draft handoff
**Do:** Create a typed context for pending support drafts containing selected `SupportTicketType`, captured screenshot `File`, source URL, and a draft id. Add provider wiring inside the authenticated client route tree so `/help` can consume the pending draft after navigation.
**Files:** `frontend/src/contexts/SupportQuickActionContext.tsx`, `frontend/src/App.tsx`
**Depends on:** none
**Verify:** `cd frontend && npx eslint src/contexts/SupportQuickActionContext.tsx src/App.tsx`

### T2: Page screenshot capture utility
**Do:** Add a focused DOM screenshot dependency and a utility that captures the app viewport/body to a PNG `File`, excludes elements marked with a support-capture exclusion attribute, and best-effort writes the image to `navigator.clipboard` when supported.
**Files:** `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/utils/supportScreenshot.ts`
**Depends on:** none
**Verify:** `cd frontend && npm run build`

### T3: Floating support action menu
**Do:** Build a bottom-right floating support action with a bug icon. On click, animate open the three ticket options with icons and short copy. On option click, run capture animation, create pending draft, navigate to `/help?newTicket={type}`, and hide the launcher from the captured screenshot.
**Files:** `frontend/src/components/support/GlobalSupportAction.tsx`, `frontend/src/components/support/SupportLauncherButton.tsx`, `frontend/src/components/support/SupportLauncherTooltip.tsx`, `frontend/src/components/support/useRageClickPrompt.ts`, `frontend/src/utils/supportRageClick.ts`, `frontend/src/App.tsx`
**Depends on:** T1, T2
**Verify:** Manual: desktop and mobile viewport show launcher, options animate, and selecting an option navigates to `/help`.

### T4: Auto-open support composer with captured attachment
**Do:** Update `/help` to consume pending support drafts and `newTicket` query params, open the composer, select the requested type, and pass captured screenshot files into the composer. Update modal/composer props so initial type/files are reset per draft id.
**Files:** `frontend/src/pages/Help.tsx`, `frontend/src/components/support/SupportTicketComposerModal.tsx`, `frontend/src/components/support/SupportTicketComposer.tsx`
**Depends on:** T1, T3
**Verify:** Manual: selecting Bug Report, Website Edit, or Feature Request opens the matching composer tab on `/help`.

### T5: Attachment thumbnail arrival animation
**Do:** Update the attachment picker to show image thumbnails for attached screenshots/files and animate the captured screenshot thumbnail with a more obvious capture handoff: scale the preview down at center-screen, then fly it into the attachments input/list when auto-attached.
**Files:** `frontend/src/components/support/SupportTicketAttachmentPicker.tsx`, `frontend/src/components/support/SupportScreenshotHandoffPreview.tsx`
**Depends on:** T4
**Verify:** Manual: captured screenshot thumbnail animates into the attachment area and remains removable like other files.

### T6: Console log text attachment
**Do:** Add a session-only browser console buffer that captures log/info/warn/error/debug calls, redacts obvious sensitive values, and creates a timestamped `.txt` attachment during quick-action capture. Include that file in the support draft alongside the screenshot, and allow `text/plain` through existing support attachment validation.
**Files:** `frontend/src/utils/supportConsoleLogs.ts`, `frontend/src/main.tsx`, `frontend/src/contexts/SupportQuickActionContext.tsx`, `frontend/src/components/support/GlobalSupportAction.tsx`, `frontend/src/components/support/SupportTicketAttachmentPicker.tsx`, `frontend/src/pages/Help.tsx`, `src/controllers/support/support-attachments-utils/constants.ts`, `src/controllers/support/support-services/SupportTicketAttachmentService.ts`
**Depends on:** T1, T3
**Verify:** Manual: quick action opens `/help` with both the screenshot PNG and console log TXT attached.

### T7: Docs parity
**Do:** Mirror the global support action in Alloro Docs via the shared viewport or support replica, and update the Support page docs so users understand the quick action and screenshot attachment handoff.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/components/DesktopViewport.tsx`, `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/support.ts`
**Depends on:** T3, T4, T5, T6
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npx tsc --noEmit`

## Done
- [ ] `cd frontend && npm run build`
- [ ] `cd frontend && npx eslint src/components/support/GlobalSupportAction.tsx src/components/support/SupportLauncherButton.tsx src/components/support/SupportLauncherTooltip.tsx src/components/support/useRageClickPrompt.ts src/components/support/SupportTicketComposer.tsx src/components/support/SupportTicketComposerModal.tsx src/components/support/SupportTicketAttachmentPicker.tsx src/components/support/SupportScreenshotHandoffPreview.tsx src/contexts/SupportQuickActionContext.tsx src/pages/Help.tsx src/utils/supportScreenshot.ts src/utils/supportConsoleLogs.ts src/utils/supportRageClick.ts src/App.tsx`
- [ ] `npx tsc --noEmit`
- [ ] `cd /Users/rustinedave/Desktop/alloro-docs && npx tsc --noEmit`
- [ ] Manual desktop: floating support button appears bottom-right on protected client pages and does not cover primary content.
- [ ] Manual mobile: floating support button and option menu fit within safe-area bounds.
- [ ] Manual: each option navigates to `/help`, opens the composer, and selects the matching ticket type.
- [ ] Manual: screenshot capture animation runs, the captured screenshot attaches to the composer, and the thumbnail animates into attachments.
- [ ] Manual: timestamped console log `.txt` file attaches with the screenshot and contains redacted current-session console entries.
- [ ] Manual: rage clicks outside the launcher shake the bug icon and show the first tooltip for three seconds.
- [ ] Manual: clipboard failure does not block attachment or ticket creation.
- [ ] Manual: normal `/help` New ticket flow still works without captured attachments.

## Revision Log

### Rev 1 — 2026-05-28
**Change:** Make the auto-attached screenshot animation more obvious by adding a center-screen scale-down preview that then moves into the attachment input/list.
**Reason:** The original thumbnail-only arrival was too subtle to communicate that the screenshot was captured and attached.
**Updated Done criteria:** Manual screenshot capture animation must visibly scale down at center-screen before moving into attachments.

### Rev 2 — 2026-05-28
**Change:** Attach a timestamped `.txt` file containing current-session console logs alongside the screenshot.
**Reason:** Support needs lightweight debugging context with the visual report.
**Updated Done criteria:** Quick-action drafts include a redacted console log text attachment in addition to the screenshot image.

### Rev 3 — 2026-05-28
**Change:** Replace the plain headphones launcher icon with a headset/customer-support icon and remove the blue/teal launcher focus halo.
**Reason:** The launcher read too generic and the cyan outline was visually distracting.
**Updated Done criteria:** Launcher uses the `Headset` icon and only shows an orange keyboard focus ring.

### Rev 4 — 2026-05-28
**Change:** Add a left-side launcher tooltip reading "Having issues with Alloro? Help us improve!" on hover and keyboard focus.
**Reason:** The floating icon needs more context before a user opens the support menu.
**Updated Done criteria:** Launcher tooltip appears to the left without covering the icon or overflowing mobile width.

### Rev 5 — 2026-05-28
**Change:** Shorten the launcher tooltip to "Having issues? Help us improve!" and let the bubble size to the shorter copy.
**Reason:** The longer tooltip wrapped vertically and appeared clipped near the viewport edge.
**Updated Done criteria:** Launcher tooltip is readable on mobile without vertical word-stacking or clipping.

### Rev 6 — 2026-05-28
**Change:** Remove the "What do you need?" menu header, change the launcher tooltip to "Select what you need and we'll document it for you" while the menu is open, and close the launcher UI on outside click or Escape.
**Reason:** The open menu duplicated the prompt and stayed too sticky after users clicked elsewhere.
**Updated Done criteria:** Outside click/Escape closes the menu and clears launcher focus tooltip state.

### Rev 7 — 2026-05-28
**Change:** Update the open-state tooltip copy to explain that Alloro captures a page screenshot and current Alloro logs, and allow a wider tooltip width for the longer sentence.
**Reason:** The previous copy under-explained what the quick action documents.
**Updated Done criteria:** Open launcher tooltip clearly mentions the screenshot and Alloro log attachment behavior.

### Rev 8 — 2026-05-28
**Change:** Animate the launcher tooltip text swap and extract the tooltip into a focused component.
**Reason:** The copy change should feel intentional instead of snapping between short and long text, and the launcher component had outgrown the frontend file-size convention.
**Updated Done criteria:** Tooltip text fades/slides during open and closed state copy changes.

### Rev 9 — 2026-05-28
**Change:** Update the open-state tooltip copy to say Alloro logs help the team support users better, and add an orange new indicator dot to the launcher.
**Reason:** The quick action needs clearer reassurance about the attached logs and a small visual cue that the floating action is new.
**Updated Done criteria:** Floating support launcher shows an orange top-right dot and the open tooltip uses the revised copy.

### Rev 10 — 2026-05-28
**Change:** Restyle the launcher tooltip to use a white surface with navy text and a right-side pointer, and change the launcher new indicator to a smaller green dot.
**Reason:** The dark tooltip felt heavy beside the FAB and the orange dot competed with the support accent.
**Updated Done criteria:** Tooltip appears as a white callout pointing to the launcher, and the new indicator is small and green.

### Rev 11 — 2026-05-28
**Change:** Replace the launcher headset icon with the bug icon, restore the tooltip to a dark callout with white text, and remove the green new indicator dot.
**Reason:** The support action should read more directly as issue reporting without the extra new-state badge.
**Updated Done criteria:** Launcher shows the bug icon only, with no status dot, and the tooltip uses white text on a dark callout.

### Rev 12 — 2026-05-28
**Change:** Add rage-click detection that shakes the bug icon subtly and forces the first support tooltip visible for three seconds.
**Reason:** Rapid repeated clicks often mean the user is stuck; the support action should gently surface without opening a modal.
**Updated Done criteria:** Four rapid same-area clicks outside the launcher trigger a small bug-icon shake and show "Having issues? Help us improve!" for three seconds.

### Rev 13 — 2026-05-28
**Change:** Make the rage-click bug animation nudge and tilt toward the final rage-click position.
**Reason:** The prompt should feel connected to where the user's frustration happened, not just vibrate in place.
**Updated Done criteria:** Rage-click animation subtly moves and rotates toward the last click before settling.

### Rev 14 — 2026-05-28
**Change:** Change the rage-click animation sequence to rotate toward the click, vibrate, then return to its original position and rotation.
**Reason:** The prior animation blended tilt and movement together instead of reading as a deliberate rotate-vibrate-reset sequence.
**Updated Done criteria:** Rage-click animation visibly rotates first, vibrates second, and settles back to neutral.
