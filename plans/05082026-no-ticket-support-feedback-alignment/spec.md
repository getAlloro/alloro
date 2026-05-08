---
id: spec-support-feedback-alignment
created: 2026-05-08
ticket: no-ticket
mode: --start
status: executed
source_docs:
  - /Users/rustinedave/Downloads/alloro_support_widget_spec (1).pdf
  - /Users/rustinedave/Downloads/Alloro_Support_System_SOP_v3 (1).pdf
  - user-provided review screenshots from 2026-05-08
supersedes:
  - plans/05052026-no-ticket-support-ticketing/spec.md
---

# Support Feedback Alignment

## Why
The first support-ticketing build works as a real client/admin system, but the review feedback shows the user-facing language, attachment support, and admin triage rules do not match how Alloro wants clients and staff to think about support. There is also a client/API privacy concern: the current shared ticket presenter can expose admin-only fields to client responses.

## What
Update the support-ticketing system across `/help` and `/admin/support` so the client form uses client-friendly language, screenshot/file attachments work, website-edit required fields are enforced, category is removed from the product surface, severity and priority are clearly separated, and resolution rules are enforced consistently. Each feedback item below has a verdict and planned treatment.

## Feedback Verdicts

| # | Feedback | Verdict | Planned treatment | Deliberate decision needed |
|---|---|---|---|---|
| 1 | Client field titles are too technical, for example "Steps to reproduce." | Valid. Required change. | Replace technical labels with client-language prompts from the PDFs and review notes. Bug copy should ask what they were trying to do, what happened, and how it affects their work. | No, unless final wording needs Jo/Corey approval. |
| 2 | Bug report cannot add a screenshot. | Valid. Required change. | Add support-ticket attachments. The original PDF excluded uploads, so this is a real scope expansion. | Yes: confirm file policy. Recommended: images and PDF only, 10MB each, max 5 files per ticket. |
| 3 | "Problem Solved" language is wrong and should be a question. | Valid. Required change. | Rename feature request prompt to client language such as "How would this help your practice use Alloro?" | Minor copy decision only. |
| 4 | Feature request cannot add a screenshot. | Valid. Required change. | Same attachment system as bug reports. Attachments should not be duplicated per ticket type. | Covered by #2. |
| 5 | Approval notes and completion date should not be optional on website edit. | Valid. Required change, overriding the original PDF where deadline was optional. | Make both required in client UI and backend validation for website edits. | No, assuming latest review feedback supersedes the PDF. |
| 6 | Clear up Severity vs Priority. | Valid. Required change. | Severity becomes client-impact language. Priority becomes internal Alloro prioritization. UI and backend must stop presenting both as generic dropdowns. | Yes: choose priority storage. Recommended: migrate to P-level priority values instead of relabeling old enum values. |
| 7 | Internal notes only optional; resolution required only to close/resolve/archive; remove Category. | Partially already true, partially missing. | Keep internal notes optional. Require resolution notes for `resolved`, `wont_fix`, and `archived`. Remove category from UI/API. | Yes: decide whether to hard-drop the `category` DB column now. Recommended: deprecate column, do not drop in this pass. |

## Context

**Relevant files:**
- `frontend/src/components/support/SupportTicketComposer.tsx` - client ticket modal and guided field labels.
- `frontend/src/pages/Help.tsx` - client ticket list/detail surface.
- `frontend/src/api/support.ts` - client support API contract.
- `frontend/src/hooks/queries/useSupportQueries.ts` - React Query hooks for ticket create/update/message flows.
- `frontend/src/components/Admin/support/AdminSupportTriageForm.tsx` - admin triage fields currently showing severity, priority, category, internal notes, and resolution notes.
- `frontend/src/components/Admin/support/supportTriageMeta.ts` - admin option labels and visual metadata.
- `frontend/src/components/Admin/support/AdminSupportTicketPanel.tsx` - admin ticket detail and reply workflow.
- `frontend/src/pages/admin/SupportDashboard.tsx` - admin support route, list filters, and detail panel composition.
- `src/routes/support.ts` - client support routes under `/api/support`.
- `src/routes/admin/support.ts` - admin support routes under `/api/admin/support`.
- `src/controllers/support/SupportTicketsController.ts` - client support controller.
- `src/controllers/admin-support/AdminSupportTicketsController.ts` - admin support controller.
- `src/controllers/support/support-services/SupportTicketService.ts` - ticket create/update/message/event service layer.
- `src/controllers/support/support-utils/supportTicketValidation.ts` - create/update validation and status close rules.
- `src/controllers/support/support-utils/supportTicketPresenter.ts` - current shared presenter; must split client/admin response shaping.
- `src/models/SupportTicketModel.ts` - ticket query/model helpers.
- `src/models/SupportTicketMessageModel.ts` - message query/model helpers.
- `src/database/migrations/20260505000000_create_support_ticketing.ts` - existing support ticket schema.
- `src/database/migrations/20260505000001_add_archived_support_ticket_status.ts` - archived status migration.

**Patterns to follow:**
- Backend stays route -> controller -> service -> model. Controllers should not own DB details.
- Frontend components use API modules and React Query hooks rather than direct fetch calls.
- Client routes remain organization-scoped. Admin routes remain super-admin scoped.
- File bytes live in S3. Database stores metadata and S3 keys only.

**Reference files:**
- `src/routes/pm/attachments.ts` - closest route analog for multer upload wiring.
- `src/controllers/pm/PmAttachmentsController.ts` - closest controller analog for S3-backed attachment upload/list/url/delete behavior.
- `src/controllers/pm/pm-attachments-utils/constants.ts` - MIME and size validation pattern.
- `src/controllers/pm/pm-attachments-utils/s3-key.ts` - S3 key construction pattern.
- `src/models/PmTaskAttachmentModel.ts` - attachment metadata model analog.
- `src/database/migrations/20260414000001_create_pm_task_attachments.ts` - attachment metadata table analog.

## Constraints

**Must:**
- Preserve `/help` and `/admin/support` as the canonical client/admin surfaces.
- Preserve the legacy `/api/support/inquiry` route unless explicitly retired in a separate plan.
- Add support-specific attachment storage. Do not couple support tickets to PM task attachments.
- Restrict upload MIME types and file sizes server-side. Frontend validation is not security.
- Split client and admin presenter behavior so client responses never include internal notes, internal priority, assignee data, admin-only messages, or admin-only event metadata.
- Make backend validation mirror required frontend fields.
- Make website-edit `approvalNotes` and `requestedCompletionDate` required on create.
- Require resolution notes when moving a ticket to `resolved`, `wont_fix`, or `archived`.
- Remove category from client/admin payloads and UI.
- Use client-friendly field labels and help text. Avoid developer phrases like "steps to reproduce."
- Keep internal notes optional in every status.

**Must not:**
- Accept arbitrary uploads such as HTML, JS, executables, archives, or unknown binary blobs.
- Expose permanent S3 URLs.
- Hardcode user IDs or organization IDs.
- Drop existing `category` data without explicit approval.
- Rename or repurpose schema enum values silently.
- Mix this work with unrelated admin-dashboard refactors.

**Out of scope:**
- Real-time chat.
- Email template redesign beyond any required attachment/field summaries.
- Public feature voting or client voting.
- External helpdesk integrations.
- Client-side delete of submitted attachments after ticket creation, unless needed as part of the final upload UX decision.
- Full cleanup of historical category data if the category column is only deprecated.

## Deliberate Decisions Before Execution

## Execution Assumptions

Dave said "okay execute now" on 2026-05-08. Execution proceeds with the recommendations below:
- D1: all ticket types support attachments; server accepts image/PDF files only, 10MB each, max 5 files per ticket.
- D2: migrate priority to explicit P-level values (`p0`, `p1`, `p2`, `p3`), and migrate severity to client-impact values (`low`, `medium`, `high`).
- D3: remove category from UI/API, but keep the existing DB column deprecated and unused.
- D4: enforce required fields conditionally by ticket type/status. Internal notes remains optional.
- D5: archived is treated as a closing state and requires resolution notes.

### D1: Attachment scope and policy
**Recommendation:** Allow attachments on all three ticket types, but position screenshots mainly in bug and feature request UI. Accept `image/png`, `image/jpeg`, `image/webp`, `image/gif`, and `application/pdf`. Cap at 10MB per file and 5 files per ticket.

**Why:** Website edits often need reference images too. Restricting by type keeps the upload surface narrow and defensible.

**Alternatives:**
- A: Bug and feature request only. Less UI work, but website edits remain awkward.
- B: All ticket types with image/PDF restrictions. Recommended.
- C: Broad file upload. Rejected unless a stronger business case appears.

### D2: Priority storage model
**Recommendation:** Migrate internal priority to explicit P-level values, likely `p0`, `p1`, `p2`, `p3`, with UI labels such as `P0 - Action within 24 hours`. Keep severity as client impact values `high`, `medium`, `low`.

**Why:** The review feedback uses P-level operational language. Pretending the old generic values are P-level values creates future confusion in reporting and automation.

**Alternatives:**
- A: Keep existing enum values and only relabel UI. Fastest, but dishonest data semantics.
- B: Migrate to P-level priority values. Recommended.
- C: Add a second `internal_priority` column and deprecate `priority`. More compatible, but leaves two concepts to maintain.

### D3: Category removal depth
**Recommendation:** Remove category from UI, API request bodies, response payloads, filters, and validation. Keep the existing DB column as deprecated/unused in this pass.

**Why:** Product removal is the user-visible need. Dropping the column adds data-loss risk for no immediate product value.

**Alternatives:**
- A: Product removal only, keep deprecated DB column. Recommended.
- B: Full DB drop now. Requires explicit approval because it destroys existing category data.

### D4: "Internal notes is the only optional field"
**Recommendation:** Interpret this as "admin-required fields should be enforced by workflow state and ticket type, while internal notes always remain optional." Do not require every possible field on every status.

**Proposed rules:**
- `internalNotes`: optional always.
- `resolutionNotes`: required when status becomes `resolved`, `wont_fix`, or `archived`.
- `severity`: required for bug triage, using client-impact values.
- `priority`: required for all admin-triaged tickets, using internal P-level values.
- `requestedCompletionDate`: required for website edits.
- `approvalNotes`: required for website edits.
- `assignee`: recommended required before `in_progress`, but this needs confirmation because current system allows unassigned fallback.
- `targetSprint`: recommended optional unless Alloro wants sprint assignment to become mandatory for active work.

### D5: Archive semantics
**Recommendation:** Treat archive as a closing action that requires resolution notes, because the feedback explicitly groups archive with close/resolve.

**Why:** Otherwise archive becomes a loophole around the resolution requirement.

## Risk

**Level:** 4 - Major impact

This touches DB schema, upload handling, client API contracts, admin workflow rules, and both client-facing and admin-facing UI.

**Risks identified:**
- Attachment upload expands the threat surface.  
  **Mitigation:** Use a support-specific S3 prefix/table, server-side MIME allowlist, size limit, max-count validation, no permanent URLs, and route-level auth/organization checks.
- Priority enum migration can break existing rows, filters, and frontend types.  
  **Mitigation:** Define an explicit mapping in the migration and update API/frontend types in the same execution pass. Do not execute until D2 is confirmed.
- Client API currently risks exposing admin-only fields through the shared presenter.  
  **Mitigation:** Split presenter functions into client-safe and admin-full shapes, and add a regression test or focused verification against client ticket responses.
- Removing category from UI but keeping the DB column can leave dead schema.  
  **Mitigation:** Mark the column deprecated in code comments/spec and schedule hard deletion only if Dave approves data loss.
- Required-field changes can block current support workflows if defaults are wrong.  
  **Mitigation:** Apply validation conditionally by ticket type/status, surface clear inline errors, and backfill/migrate existing tickets where needed.
- Screenshot upload UI can become duplicated across ticket-type branches.  
  **Mitigation:** Build one reusable support attachment picker/list component and render it for allowed ticket types.

**Blast radius:**
- Client `/help` ticket creation, list, detail, and reply workflows.
- Admin `/admin/support` filters, triage form, detail panel, and status transitions.
- `/api/support/tickets` client create/list/detail/message endpoints.
- `/api/admin/support/tickets` admin list/detail/update/message endpoints.
- Support ticket database schema and TypeScript models.
- Existing support notification email payloads if they include guided-answer labels.
- Any current sandbox/prod tickets with existing `severity`, `priority`, or `category` values.

**Pushback:**
- The old PDF said screenshots were out of scope. The new feedback reverses that, so this is not a quick copy tweak. Treat it as a real backend feature.
- Do not solve P-level priority with labels alone unless speed beats correctness. Future reporting and SLA automation will hate fake semantics.
- Hard-dropping category now is unnecessary risk unless the business specifically wants historical data removed.

## Tasks

### T1: Client language and required client fields
**Do:** Update the client ticket composer labels, placeholders, helper text, guided-answer keys, and validation so copy is client-facing. Replace developer phrases with the PDF/review language. Make website edit `approvalNotes` and `requestedCompletionDate` required. Rename feature request "Problem Solved" to a question.  
**Files:** `frontend/src/components/support/SupportTicketComposer.tsx`, `frontend/src/api/support.ts`, `frontend/src/hooks/queries/useSupportQueries.ts`, `src/controllers/support/support-utils/supportTicketValidation.ts`, `src/controllers/support/support-services/SupportTicketService.ts`  
**Depends on:** D4  
**Verify:** Manual `/help` create flow for bug, feature request, and website edit; backend rejects missing website approval notes/date.

### T2: Support attachment backend
**Do:** Add support-specific attachment metadata table/model/routes/controller/service helpers. Store bytes in S3 under a support-specific prefix. Add upload/list/presigned-url endpoints with auth, organization scoping, MIME allowlist, size limit, and max-count enforcement.  
**Files:** `src/database/migrations/*support_ticket_attachments*.ts`, `src/models/SupportTicketAttachmentModel.ts`, `src/routes/support.ts`, `src/routes/admin/support.ts`, `src/controllers/support/SupportTicketAttachmentsController.ts`, `src/controllers/support/support-attachments-utils/*`, `src/controllers/support/support-services/SupportTicketService.ts`  
**Depends on:** D1  
**Verify:** Upload allowed image/PDF, reject blocked MIME, reject oversized file, list only same-organization attachments for client, admin can view by ticket.

### T3: Support attachment frontend
**Do:** Add reusable attachment picker/list UI for new tickets and ticket detail where appropriate. Render uploaded screenshots/files in client and admin ticket details using presigned URLs. Keep layout stable on mobile and desktop.  
**Files:** `frontend/src/components/support/SupportTicketComposer.tsx`, `frontend/src/components/support/SupportTicketAttachmentPicker.tsx`, `frontend/src/pages/Help.tsx`, `frontend/src/components/Admin/support/AdminSupportTicketPanel.tsx`, `frontend/src/api/support.ts`, `frontend/src/hooks/queries/useSupportQueries.ts`  
**Depends on:** T2  
**Verify:** Attachments can be added during bug and feature request creation; attachments are visible after submit; upload errors are clear.

### T4: Severity and priority separation
**Do:** Update admin triage model/types/copy so severity means client impact and priority means internal Alloro priority. Implement the chosen D2 storage path. Remove generic dual dropdown behavior. Add client-language severity descriptions and internal P-level priority descriptions.  
**Files:** `src/database/migrations/*support_priority*.ts`, `src/models/SupportTicketModel.ts`, `src/controllers/support/support-utils/supportTicketValidation.ts`, `src/controllers/support/support-utils/supportTicketPresenter.ts`, `src/controllers/admin-support/AdminSupportTicketsController.ts`, `frontend/src/components/Admin/support/AdminSupportTriageForm.tsx`, `frontend/src/components/Admin/support/supportTriageMeta.ts`, `frontend/src/pages/admin/SupportDashboard.tsx`  
**Depends on:** D2  
**Verify:** Existing tickets map correctly; admin filters still work; bug severity labels are client-impact language; priority labels are P-level internal language.

### T5: Category removal and admin required fields
**Do:** Remove category from admin UI, filters, request payloads, response payloads, and validation. Keep internal notes optional. Enforce resolution notes for `resolved`, `wont_fix`, and `archived`. Apply conditional admin required-field validation from D4.  
**Files:** `frontend/src/components/Admin/support/AdminSupportTriageForm.tsx`, `frontend/src/components/Admin/support/supportTriageMeta.ts`, `frontend/src/pages/admin/SupportDashboard.tsx`, `frontend/src/api/support.ts`, `src/controllers/support/support-utils/supportTicketValidation.ts`, `src/controllers/admin-support/AdminSupportTicketsController.ts`, `src/controllers/support/support-services/SupportTicketService.ts`  
**Depends on:** D3, D4, D5  
**Verify:** Category is gone from admin UI/API; archive without resolution is rejected; internal notes remains optional.

### T6: Client/admin response contract cleanup
**Do:** Split support ticket presenter behavior into client-safe and admin-full response shapes. Ensure client ticket responses exclude internal notes, internal priority when not client-relevant, assignee data, admin-only events, and internal messages. Admin routes retain full operational data.  
**Files:** `src/controllers/support/support-utils/supportTicketPresenter.ts`, `src/controllers/support/SupportTicketsController.ts`, `src/controllers/admin-support/AdminSupportTicketsController.ts`, `src/controllers/support/support-services/SupportTicketService.ts`, `frontend/src/api/support.ts`  
**Depends on:** T4, T5  
**Verify:** Client `GET /api/support/tickets` and detail responses contain no admin-only fields; admin detail still contains full triage data.

### T7: Verification and regression pass
**Do:** Run typecheck, relevant lint/tests if configured, and focused manual/browser/API verification for `/help` and `/admin/support`. Verify migration up/down behavior in local/sandbox-safe context before production use.  
**Files:** No primary implementation files; verification only.  
**Depends on:** T1, T2, T3, T4, T5, T6  
**Verify:** `npx tsc --noEmit`; configured lint/test command if available; manual browser checks for client and admin surfaces.

## Done
- [x] Client form labels use client language and no longer expose "steps to reproduce" or "Problem Solved" as-is.
- [x] Bug and feature request screenshot/file attachment flow works in code and is backed by a DB migration.
- [x] Website edit creation requires approval notes and requested completion date in UI and backend.
- [x] Severity and priority are visibly and semantically separated.
- [x] Category is removed from UI/API.
- [x] Internal notes remains optional.
- [x] Resolution notes are required for `resolved`, `wont_fix`, and `archived`.
- [x] Client support API responses do not expose admin-only fields.
- [x] `npx tsc --noEmit` has no errors caused by this work.
- [x] Relevant build/lint checks complete.

## Finalization Notes

- Verified `npx tsc --noEmit` from repo root.
- Verified `npm run build` from `frontend/`.
- Verified targeted ESLint over touched support frontend files.
- Full frontend lint remains blocked by pre-existing unrelated lint errors across the app.
- The support DB migration was created but not applied to the shared database during this session. Live smoke testing for uploads and enum-backed priority/severity requires applying `src/database/migrations/20260508000000_support_feedback_alignment.ts`.
