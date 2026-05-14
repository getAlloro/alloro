# Integration Revocation Repair

## Why
Rybbit and GSC integrations were incorrectly marked `revoked` by the CRM mapping validation worker. That worker applies credential-token rules to every active integration, but Rybbit and GSC do not store per-row encrypted credentials.

## What
Constrain daily CRM mapping validation to CRM push integrations only, then repair the live rows that were revoked with the exact erroneous validation message.

## Context

**Relevant files:**
- `src/workers/processors/crmMappingValidation.processor.ts` — daily CRM token/form validation; currently queries all active integrations.
- `src/models/website-builder/WebsiteIntegrationModel.ts` — existing integration query helpers; already has `findActiveByTypes`.
- `website_builder.website_integrations` — live rows to repair.

**Pattern to follow:**
- Use the existing model query helper instead of adding another inline Knex query in the worker.

## Constraints

**Must:**
- Only CRM/form integrations should be processed by `crm-mapping-validation`.
- Repair only rows where `platform IN ('rybbit', 'gsc')`, `status='revoked'`, and `last_error='Could not decrypt credentials during daily validation'`.

**Must not:**
- Change HubSpot validation semantics.
- Touch unrelated integrations or unrelated status values.
- Revert unrelated workspace changes.

## Risk

**Level:** 2

**Risks identified:**
- Live DB repair can accidentally reactivate genuinely revoked integrations. → **Mitigation:** exact WHERE clause on platform, status, and the known erroneous error string.
- Narrowing validation by type could miss malformed CRM rows if their type is wrong. → **Mitigation:** this is correct; malformed CRM rows should be fixed as bad CRM data, not handled by sweeping every integration platform.

**Blast radius:** `crm-mapping-validation` worker, HubSpot mapping validation, Rybbit/GSC integration status display and harvest eligibility.

## Tasks

### T1: Scope CRM mapping validation
**Do:** Replace the worker's all-active integration query with the existing active-by-type query for `crm_push`.
**Files:** `src/workers/processors/crmMappingValidation.processor.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Repair incorrectly revoked analytics integrations
**Do:** Update only Rybbit/GSC rows with the erroneous daily-validation error back to `active`, clearing `last_error`.
**Files:** live PostgreSQL data only
**Depends on:** T1
**Verify:** Query active org-attached Rybbit/GSC status counts before and after.

## Done
- [x] `npx tsc --noEmit` passes or has no new errors from this change.
- [x] Active org-attached Rybbit/GSC integrations are active again.
- [x] CRM validation worker no longer selects non-CRM integration types.
- [x] No unrelated files staged or reverted.
