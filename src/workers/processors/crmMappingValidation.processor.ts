/**
 * CRM Mapping Validation Processor — daily scheduled job.
 *
 * Consumes the `crm-mapping-validation` queue. Iterates active integrations
 * across all websites and:
 *   1. Validates the token via adapter.validateConnection()
 *      - On 401/invalid: marks integration status='revoked', skips form check
 *   2. Lists current vendor forms via adapter.listForms()
 *      - Marks any active mapping whose vendor_form_id is NOT in the response
 *        as status='broken'
 *      - Updates last_validated_at on still-valid mappings
 *   3. Updates integration.last_validated_at + last_error
 *
 * Failures on individual integrations do not abort the run — best-effort
 * sweep across all integrations, with per-integration error logging.
 */

import { Job } from "bullmq";
import { WebsiteIntegrationModel } from "../../models/website-builder/WebsiteIntegrationModel";
import { IntegrationFormMappingModel } from "../../models/website-builder/IntegrationFormMappingModel";
import { getAdapter } from "../../services/integrations";

const LOG_PREFIX = "[CRM-MAPPING-VALIDATION]";

export async function processCrmMappingValidation(_job: Job): Promise<void> {
  const start = Date.now();
  const integrations = await WebsiteIntegrationModel.findActiveByTypes(["crm_push"]);
  console.log(`${LOG_PREFIX} Validating ${integrations.length} active integration(s)`);

  let okCount = 0;
  let revokedCount = 0;
  let brokenCount = 0;

  for (const integration of integrations) {
    try {
      const creds = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
      if (!creds) {
        await WebsiteIntegrationModel.updateStatus(
          integration.id,
          "revoked",
          "Could not decrypt credentials during daily validation",
        );
        revokedCount++;
        continue;
      }

      const adapter = getAdapter(integration.platform);

      const validation = await adapter.validateConnection(creds);
      if (!validation.ok) {
        if (validation.error === "invalid_token") {
          await WebsiteIntegrationModel.updateStatus(
            integration.id,
            "revoked",
            validation.errorMessage ?? "Token rejected during daily validation",
          );
          revokedCount++;
          continue;
        }
        // Transient (rate_limited, network) — leave status alone, record last_error.
        await WebsiteIntegrationModel.updateLastValidated(
          integration.id,
          new Date(),
          validation.errorMessage ?? validation.error ?? "Validation transient failure",
        );
        continue;
      }

      const forms = await adapter.listForms(creds);
      const validVendorIds = forms.map((f) => f.id);

      const broken = await IntegrationFormMappingModel.bulkMarkBrokenForMissingVendorForms(
        integration.id,
        validVendorIds,
      );
      brokenCount += broken;

      await IntegrationFormMappingModel.bulkMarkValidated(integration.id, validVendorIds);
      await WebsiteIntegrationModel.updateLastValidated(integration.id, new Date(), null);
      okCount++;
    } catch (err) {
      console.error(
        `${LOG_PREFIX} Integration ${integration.id} (${integration.platform}) failed:`,
        err,
      );
      // Don't change status on unexpected errors; record last_error and move on.
      try {
        await WebsiteIntegrationModel.updateLastValidated(
          integration.id,
          new Date(),
          err instanceof Error ? err.message : String(err),
        );
      } catch {
        /* swallow */
      }
    }
  }

  const elapsed = Date.now() - start;
  console.log(
    `${LOG_PREFIX} Done in ${elapsed}ms — ok=${okCount} revoked=${revokedCount} mappings_marked_broken=${brokenCount}`,
  );
}
