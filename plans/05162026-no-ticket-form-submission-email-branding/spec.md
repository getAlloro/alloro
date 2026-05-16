# Form Submission Email Branding

## Why
Form submission emails currently use generic Alloro sender metadata and a fixed teal header. Client recipients should see the organization context and a branded header without making the template fragile.

## What
Update website form-submission emails and manual resends to use organization-scoped sender names, accent-colored headers with deterministic contrast, an Alloro logo mark in the header, and serif typography for the header/title labels.

## Context

**Relevant files:**
- `src/controllers/websiteContact/formSubmissionController.ts` — public form submission hot path.
- `src/controllers/websiteContact/websiteContact-services/emailBodyBuilder.ts` — shared HTML body builder for inbound sends and manual resends.
- `src/controllers/admin-websites/AdminWebsitesController.ts` — manual resend endpoints for stored submissions.
- `src/models/OrganizationModel.ts` — existing model for organization name lookup.

**Patterns to follow:**
- Keep recipient routing separate from presentation.
- Keep DB access through models.
- Keep template rendering pure; pass context into it instead of querying inside it.

**Reference file:** `src/controllers/websiteContact/websiteContact-services/newsletterConfirmationService.ts` — branded email payload assembly close to this domain.

## Constraints

**Must:**
- Preserve current recipient resolution and subject text.
- Use organization name for `fromName` as `[{organization name}] Alloro Forms`.
- Use project `accent_color` for the header, with safe fallback if missing/invalid.
- Choose readable header text color from the background color.
- Keep inbound sends and manual resends aligned.

**Must not:**
- Add dependencies.
- Change form routing, stored recipient semantics, or spam/flagging behavior.
- Add database schema changes.

**Out of scope:**
- Redesigning all Alloro email templates.
- Changing newsletter confirmation emails.

## Risk

**Level:** 2

**Risks identified:**
- Email HTML client compatibility can be brittle → **Mitigation:** use inline styles and table-based header alignment.
- Accent colors may be malformed or low contrast → **Mitigation:** normalize hex colors and choose dark/white text by contrast ratio.
- Manual resends can drift from inbound sends → **Mitigation:** use the same body builder and sender-context helper for both paths.

**Blast radius:** Public website form submissions, admin manual resend, admin bulk resend.

**Pushback (if any):**
- This should not become a parallel email system. The better boundary is a small shared context helper plus a pure body builder.

## Tasks

### T1: Template Styling
**Do:** Extend the form submission body builder with branded header color, contrast-safe header text, header logo, and serif header/field-label typography.
**Files:** `src/controllers/websiteContact/websiteContact-services/emailBodyBuilder.ts`
**Depends on:** none
**Verify:** `npm run build`

### T2: Sender Context
**Do:** Resolve organization sender name and project accent color via existing models/services without touching recipient routing.
**Files:** `src/controllers/websiteContact/websiteContact-services/formSubmissionEmailContextService.ts`
**Depends on:** none
**Verify:** `npm run build`

### T3: Wire Send Paths
**Do:** Use shared sender/template context for inbound sends, single manual resend, and bulk manual resend.
**Files:** `src/controllers/websiteContact/formSubmissionController.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`
**Depends on:** T1, T2
**Verify:** `npm run build`

## Done
- [x] `npm run build` passes or only pre-existing errors are present.
- [x] Subject remains `New Entry From {formName}`.
- [x] Sender name uses `[{organization name}] Alloro Forms` when organization name is available.
- [x] Header uses accent color with readable text.
- [x] Manual resend uses the same template behavior as inbound send.
