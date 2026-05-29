# Website Edit Support Copy Cleanup

## Why
The Website Edit ticket composer still asks for Approval Notes and labels the deadline field as Requested completion. That no longer matches the desired client-facing support flow.

## What
Remove Approval Notes from Website Edit ticket creation, rename the Website Edit date label to "When do you need this by?", and keep General Issue/Bug Report plus Feature Request unchanged. Sync the Alloro Docs support replica so documentation does not drift from the live UI.

## Context

**Relevant files:**
- `frontend/src/components/support/supportTicketComposerFields.ts` - owns guided fields per ticket type.
- `frontend/src/components/support/SupportTicketComposer.tsx` - renders the Website Edit date input and submit payload.
- `src/controllers/support/support-utils/supportTicketValidation.ts` - validates guided answers before ticket creation.
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/SupportReplica.tsx` - docs replica currently mirrors the stale field and label.

**Patterns to follow:**
- Keep ticket-type-specific prompt config centralized in `supportTicketComposerFields.ts`.
- Keep server-side required-field validation aligned with the fields clients can actually submit.
- Docs replicas must mirror real UI structure and visible copy.

**Reference file:** `frontend/src/components/support/SupportTicketComposer.tsx` - existing support composer rendering pattern.

## Constraints

**Must:**
- Remove `approvalNotes` from Website Edit guided fields and initial Website Edit answer state.
- Stop backend validation from requiring or storing `approvalNotes` for new `website_edit` tickets.
- Change only the Website Edit date label to "When do you need this by?"
- Update the docs Support replica to match the live Website Edit composer.
- Preserve Bug Report/General Issue and Feature Request field configs.

**Must not:**
- Rename ticket types, routes, DB columns, or support status semantics.
- Add dependencies or introduce a new support form architecture.
- Touch unrelated support workflows, attachments, admin triage, or email routing.

**Out of scope:**
- Data migrations for historical tickets.
- Redesigning the support modal.
- Changing requested completion date storage or requiredness.

## Risk

**Level:** 2

**Risks identified:**
- Frontend-only removal would cause Website Edit submissions to fail because backend validation currently requires `approvalNotes`. -> **Mitigation:** update `supportTicketValidation.ts` in the same execution.
- Stale clients or old docs fixtures may still include `approvalNotes`. -> **Mitigation:** remove the field from active configs and docs fixtures, and strip the deprecated key from new Website Edit payloads; preserve historical ticket data rather than migrating old rows.
- Docs drift is already present in the Support replica. -> **Mitigation:** include the docs replica in the implementation and verify the relevant strings are gone there too.

**Blast radius:**
- Client `/help` support ticket composer.
- `POST /api/support/tickets` validation for Website Edit tickets.
- Initial support ticket message generation, because it formats submitted guided answers.
- Alloro Docs Support page replica.

**Pushback:**
- Do not solve this by hiding the field only in JSX. Future-us will hate the invisible backend requirement when client submissions start failing.

## Tasks

### T1: Website Edit composer copy
**Do:** Remove `approvalNotes` from Website Edit field config and initial answers. Change the Website Edit date label to "When do you need this by?" Leave Bug Report/General Issue and Feature Request untouched.
**Files:** `frontend/src/components/support/supportTicketComposerFields.ts`, `frontend/src/components/support/SupportTicketComposer.tsx`
**Depends on:** none
**Verify:** `rg -n "Approval notes|Requested completion" frontend/src/components/support`

### T2: Website Edit server validation alignment
**Do:** Stop requiring `guidedAnswers.approvalNotes` for `website_edit` ticket creation and strip the deprecated key from new Website Edit payloads. Keep page URL, requested change, and requested completion date validation intact.
**Files:** `src/controllers/support/support-utils/supportTicketValidation.ts`, `src/controllers/support/support-services/SupportTicketHelpers.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Support docs replica parity
**Do:** Remove the Approval Notes field from the Support docs replica and change the Website Edit date label to "When do you need this by?"
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/SupportReplica.tsx`
**Depends on:** T1
**Verify:** `rg -n "Approval notes|Requested completion" /Users/rustinedave/Desktop/alloro-docs/src/components/replicas/SupportReplica.tsx`

## Done
- [ ] `npx tsc --noEmit` passes or reports only unrelated pre-existing errors.
- [ ] `cd frontend && npm run build` passes.
- [ ] `cd /Users/rustinedave/Desktop/alloro-docs && npx tsc --noEmit` passes or reports only unrelated pre-existing errors.
- [ ] Manual: Website Edit composer shows no Approval Notes field and uses "When do you need this by?"
- [ ] Manual: Bug Report/General Issue and Feature Request tabs are unchanged.
- [ ] Manual: Website Edit ticket creation is not blocked by missing approval notes.
