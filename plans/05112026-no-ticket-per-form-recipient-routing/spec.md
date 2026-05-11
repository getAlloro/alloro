# Per-Form Recipient Routing

## Why
Website form submissions currently resolve recipients at the project/organization level, so every form on a website routes to the same inbox list. We need per-form recipient overrides while preserving the existing default recipient fallback chain.

## What
Add backend-owned per-form recipient routing for website submissions, backed by project-scoped rules and an admin UI on the website Forms tab. Existing forms should be auto-detected from prior submissions and current page/template markup so an admin can assign recipients without redesigning templates first.

Done means a submission for a configured form emails that form's recipients, an unconfigured form falls back to the existing website/org recipient behavior, and the submission row still records the actual `recipients_sent_to`.

## Context

**Relevant files:**
- `src/controllers/websiteContact/formSubmissionController.ts` - public submission handler; currently resolves `website_form` recipients before save/email.
- `src/services/recipientSettingsService.ts` - canonical recipient normalization, validation, and fallback resolution.
- `src/controllers/admin-websites/feature-services/service.form-detection.ts` - current submission-backed form catalog and field-shape detection.
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` - exposes detected forms for admin integration flows.
- `src/routes/admin/websites.ts` - admin website routes, including detected forms and form submissions.
- `src/models/website-builder/FormSubmissionModel.ts` - submission persistence model and closest existing form-submission model boundary.
- `src/database/migrations/20260501000000_create_organization_recipient_settings.ts` - closest recipient settings migration pattern.
- `frontend/src/pages/admin/WebsiteDetail.tsx` - Forms tab currently renders default recipients plus submissions.
- `frontend/src/components/Admin/RecipientsConfig.tsx` - current project recipient editor pattern.
- `frontend/src/api/websites.ts` - website admin API client and form submission types.

**Patterns to follow:**
- Backend routes stay thin: route -> controller -> service -> model.
- Business logic belongs in services, not React components or route handlers.
- DB access for new behavior goes through models, not scattered inline queries.
- Recipient validation reuses `validateRecipientList` and normalization from `recipientSettingsService.ts`.
- Frontend API calls live in `frontend/src/api/websites.ts`; components consume typed helpers.

**Reference files:**
- `src/database/migrations/20260501000000_create_organization_recipient_settings.ts` - migration style, JSONB recipients, timestamps, uniqueness.
- `src/models/OrganizationRecipientSettingsModel.ts` - upsert/find model shape for recipient configuration.
- `frontend/src/components/Admin/RecipientsConfig.tsx` - small recipient chip editor behavior to match.

## Constraints

**Must:**
- Route submissions on the backend, not by frontend conditions.
- Support one recipient list per project/form.
- Merge form detection from prior submissions and current page/template HTML `data-form-name` values.
- Preserve existing fallback recipient behavior when a form has no enabled override or has an empty recipient list.
- Persist the final resolved recipient list in `website_builder.form_submissions.recipients_sent_to`.
- Keep CRM mapping behavior keyed to the sanitized submitted form name.
- Exclude `Newsletter Signup` from per-form routing v1 unless a later requirement says otherwise.
- Validate email arrays server-side.

**Must not:**
- Redesign forms into shortcodes as part of this scope.
- Move recipient routing into the renderer or frontend.
- Add a new dependency.
- Change public submission payload shape from the renderer.
- Refactor unrelated form, CRM, newsletter, or ranking code.
- Rewrite historical submissions or resend old emails.

**Out of scope:**
- A new shortcode/template form authoring system.
- Stable global form IDs.
- Field schema editing.
- Conditional routing based on field answers.
- CRM mapping changes.
- Newsletter-specific recipient routing.

## Risk

**Level:** 3 - Structural Risk

**Risks identified:**
- Public lead email routing is a hot path. A bug can drop notifications while still saving submissions.
  **Mitigation:** centralize resolution in one service, keep the existing fallback resolver intact, and verify configured, unconfigured, and flagged submissions.
- Submission-only detection misses forms that have not received traffic.
  **Mitigation:** merge submission aggregates with page/template markup detection for `data-form-name`.
- Matching by display form name is brittle when names differ by whitespace/case/punctuation.
  **Mitigation:** store both `form_name` and normalized `form_key`; unique rules by `(project_id, form_key)`.
- Duplicate recipient logic can drift between default and per-form settings.
  **Mitigation:** reuse `normalizeRecipients` and `validateRecipientList`; do not create a second email validator.
- Direct DB queries in feature services are already present in form detection. Adding more would deepen the drift.
  **Mitigation:** put new DB operations behind model methods and keep service code orchestration-focused.

**Blast radius:**
- Public website submission endpoint: `/api/websites/form-submission`.
- Admin website Forms tab.
- Existing detected form APIs used by integration mapping.
- Email webhook delivery.
- CRM enqueue path, because it shares the sanitized form name after submission save.
- Existing project/org recipient settings fallback.

**Pushback:**
- A shortcode redesign is premature for this requirement. Future-us will hate having routing depend on template-authoring syntax when the actual invariant is submission routing. The better first move is backend rules plus detection, then consider a shortcode/template form registry later if form authoring needs stronger guarantees.

## Tasks

### T1: Add per-form recipient rule persistence
**Do:** Create a DB migration and model for `website_builder.form_recipient_rules` with project/form uniqueness, validated recipient storage, enable/disable state, and timestamps.
**Files:** `src/database/migrations/20260511000000_create_form_recipient_rules.ts`, `src/models/website-builder/FormRecipientRuleModel.ts`
**Depends on:** none
**Verify:** backend typecheck plus migration up/down against a safe local database only.

### T2: Build backend routing service
**Do:** Add a service that normalizes form names to `form_key`, looks up the project/form rule, returns enabled non-empty rule recipients first, and otherwise calls the existing `resolveRecipients({ channel: "website_form" })`. Include source metadata for logs/debugging without changing public response shape.
**Files:** `src/services/formRecipientRoutingService.ts`, `src/services/recipientSettingsService.ts` if source typing needs extension
**Depends on:** T1
**Verify:** focused unit/service coverage where available, plus backend typecheck.

### T3: Wire routing into the public submission handler
**Do:** Replace direct `resolveRecipients` usage in `formSubmissionController.ts` with the new routing service after `sanitizedFormName` is known. Preserve save-before-AI behavior, flagged-email suppression, CRM enqueue behavior, and `recipients_sent_to` persistence.
**Files:** `src/controllers/websiteContact/formSubmissionController.ts`
**Depends on:** T2
**Verify:** manual/API checks for configured form, unconfigured form fallback, no-recipient warning, and flagged submission no-email path.

### T4: Expand form catalog and admin APIs
**Do:** Add admin endpoints that return a project form catalog merged from submissions and markup detection, with recipient rule state included. Add upsert/update endpoints for per-form recipients using server-side validation. Keep existing detected-form routes compatible for integration mapping.
**Files:** `src/controllers/admin-websites/WebsiteIntegrationsController.ts` or a dedicated admin website forms controller, `src/controllers/admin-websites/feature-services/service.form-detection.ts`, `src/routes/admin/websites.ts`, supporting model methods as needed
**Depends on:** T1
**Verify:** API checks for submission-only forms, markup-only forms, configured forms, disabled rules, and invalid recipient emails.

### T5: Add Forms tab recipient routing UI
**Do:** Update the Forms tab to show default recipients as fallback and add a per-form routing panel. Each detected form should show source, submission count/last seen when available, current override state, and a recipient editor using the existing recipient chip pattern.
**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`, `frontend/src/api/websites.ts`, new component under `frontend/src/components/Admin/` if needed
**Depends on:** T4
**Verify:** frontend typecheck and manual admin UI smoke test for loading, saving, disabling, and fallback display.

## Done
- [ ] Backend migration exists and can be rolled back.
- [ ] `npx tsc --noEmit` passes or only pre-existing unrelated errors are documented.
- [ ] Frontend typecheck passes or only pre-existing unrelated errors are documented.
- [ ] Targeted lint passes for touched backend/frontend files where configured.
- [ ] Manual/API: configured `Referral Form` or equivalent routes to its override recipients.
- [ ] Manual/API: unconfigured `Contact Form` falls back to existing website/org recipients.
- [ ] Manual/API: flagged submissions are saved but do not send email.
- [ ] Manual/API: form catalog includes prior-submission forms and current markup-only forms.
- [ ] Existing detected-form integration mapping route remains compatible.
- [ ] No shortcode/template redesign work included.
