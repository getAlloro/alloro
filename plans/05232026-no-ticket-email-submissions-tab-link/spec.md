# Email Submissions Tab Link

## Why
Website form emails currently mention uploaded files but link to a legacy `?view=submissions` URL that the DFY website page cleans up instead of preserving. For photo-heavy submissions, recipients should get a clear dashboard link without exposing patient images in email.

## What
Update form-submission emails to link to `/dfy/website?tab=submissions` and make the DFY website page open the requested top-level tab from `?tab=`.

## Constraints

**Must:**
- Keep uploaded images out of the email body.
- Preserve existing dashboard submission previews and downloads.
- Support the old `?view=` param as a compatibility fallback.

**Must not:**
- Add permanent public image URLs.
- Change form routing, recipient resolution, or S3 storage.
- Modify unrelated dashboard tabs.

## Risk

**Level:** 2

**Risks identified:**
- Query-param handling can drift from visible tab state. → **Mitigation:** centralize allowed tab parsing and update tab clicks through one setter.
- Existing emails may still use `?view=submissions`. → **Mitigation:** keep `view` fallback and normalize it to `tab`.

**Blast radius:** Form submission email HTML, DFY website top-level tab selection.

## Tasks

### T1: Email link copy
**Do:** Point uploaded-file note to `/dfy/website?tab=submissions` and clarify that photos/downloads live in the dashboard.
**Files:** `src/controllers/websiteContact/websiteContact-services/emailBodyBuilder.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: DFY website tab permalink
**Do:** Add `?tab=` parsing for `editor`, `submissions`, `posts`, and `menus`; update tab clicks and page selection to keep URL/tab state aligned while tolerating legacy `?view=`.
**Files:** `frontend/src/pages/DFYWebsite.tsx`
**Depends on:** none
**Verify:** `cd frontend && npm run build`

### T3: Docs parity
**Do:** Update the Website docs walkthrough copy to mention `?tab=` direct links.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/website.ts`
**Depends on:** T2
**Verify:** `git -C /Users/rustinedave/Desktop/alloro-docs diff --check`

## Done
- [x] Email note links to `https://app.getalloro.com/dfy/website?tab=submissions`
- [x] `/dfy/website?tab=submissions` opens the Submissions tab
- [x] Legacy `/dfy/website?view=submissions` still opens Submissions and normalizes
- [x] Alloro Docs Website walkthrough mentions `?tab=` direct links
- [x] `npx tsc --noEmit` has no new errors
- [x] `cd frontend && npm run build` passes
