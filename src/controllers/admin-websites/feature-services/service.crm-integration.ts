/**
 * CRM Integration service.
 *
 * Business logic for the vendor-CRM (HubSpot, …) integration lifecycle:
 * create + validate, update (with credential re-validation), mapping
 * validation against live vendor forms, and field-mapping inference.
 *
 * Extracted from WebsiteIntegrationsController.ts. Each function throws a typed
 * CrmIntegrationError on an expected failure (carrying the HTTP status + code +
 * message the controller used to return inline); the controller maps it back to
 * a fail() response. All DB access stays in the models.
 */

import {
  WebsiteIntegrationModel,
  type IntegrationPlatform,
  type IntegrationStatus,
  type IWebsiteIntegrationSafe,
} from "../../../models/website-builder/WebsiteIntegrationModel";
import {
  IntegrationFormMappingModel,
  type IIntegrationFormMapping,
} from "../../../models/website-builder/IntegrationFormMappingModel";
import { getAdapter } from "../../../services/integrations";
import { inferFieldMapping } from "../../../services/integrations/fieldInference";
import type { VendorForm } from "../../../services/integrations/types";
import * as formDetection from "./service.form-detection";

export class CrmIntegrationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CreateIntegrationInput {
  platform?: string;
  label?: string | null;
  credentials?: string;
}

export interface UpdateIntegrationInput {
  label?: string | null;
  credentials?: string;
}

export interface InferMappingResult {
  vendor_form: VendorForm;
  website_fields: Awaited<ReturnType<typeof formDetection.getFormFieldShape>>;
  inferred_mapping: ReturnType<typeof inferFieldMapping>;
}

/**
 * Validate input + vendor credentials, ensure no duplicate platform exists, then
 * create the integration and stamp last_validated_at.
 */
export async function createIntegration(
  projectId: string,
  input: CreateIntegrationInput,
): Promise<IWebsiteIntegrationSafe> {
  const { platform, label, credentials } = input;

  if (!platform || typeof platform !== "string") {
    throw new CrmIntegrationError(400, "INVALID_INPUT", "platform is required");
  }
  if (!credentials || typeof credentials !== "string" || credentials.length < 8) {
    throw new CrmIntegrationError(400, "INVALID_INPUT", "credentials are required");
  }

  let adapter;
  try {
    adapter = getAdapter(platform);
  } catch {
    throw new CrmIntegrationError(
      400,
      "UNSUPPORTED_PLATFORM",
      `Platform '${platform}' is not supported`,
    );
  }

  const validation = await adapter.validateConnection(credentials);
  if (!validation.ok) {
    throw new CrmIntegrationError(
      400,
      "INVALID_CREDENTIALS",
      validation.errorMessage || "Vendor rejected credentials",
    );
  }

  const existing = await WebsiteIntegrationModel.findByProjectAndPlatform(projectId, platform);
  if (existing) {
    throw new CrmIntegrationError(
      409,
      "ALREADY_CONNECTED",
      `An ${platform} integration already exists for this project`,
    );
  }

  const integration = await WebsiteIntegrationModel.create({
    project_id: projectId,
    platform: platform as IntegrationPlatform,
    credentials,
    label: label ?? null,
    metadata: {
      portalId: validation.portalId,
      accountName: validation.accountName,
    },
    status: "active",
  });

  await WebsiteIntegrationModel.updateLastValidated(integration.id, new Date());

  return integration;
}

/**
 * Update label and/or credentials. Supplying credentials re-validates against the
 * vendor and refreshes metadata/status. Returns the updated integration row.
 */
export async function updateIntegration(
  integration: IWebsiteIntegrationSafe,
  input: UpdateIntegrationInput,
): Promise<IWebsiteIntegrationSafe | undefined> {
  const { label, credentials } = input;

  const update: {
    label?: string | null;
    credentials?: string;
    metadata?: Record<string, unknown>;
    status?: IntegrationStatus;
    last_validated_at?: Date;
    last_error?: string | null;
  } = {};
  if (label !== undefined) update.label = label;

  if (credentials !== undefined) {
    if (typeof credentials !== "string" || credentials.length < 8) {
      throw new CrmIntegrationError(
        400,
        "INVALID_INPUT",
        "credentials must be a non-empty string",
      );
    }
    const adapter = getAdapter(integration.platform);
    const validation = await adapter.validateConnection(credentials);
    if (!validation.ok) {
      throw new CrmIntegrationError(
        400,
        "INVALID_CREDENTIALS",
        validation.errorMessage || "Vendor rejected credentials",
      );
    }
    update.credentials = credentials;
    update.metadata = {
      ...(integration.metadata ?? {}),
      portalId: validation.portalId,
      accountName: validation.accountName,
    };
    update.status = "active";
    update.last_validated_at = new Date();
    update.last_error = null;
  }

  return WebsiteIntegrationModel.update(integration.id, update);
}

/**
 * Re-validate the integration token, then cross-reference stored mappings against
 * live vendor forms — marking missing ones broken and present ones validated.
 * Returns the refreshed mapping list. Throws on missing credentials or a rejected
 * token (after flipping the integration to revoked).
 */
export async function validateMappings(
  integration: IWebsiteIntegrationSafe,
): Promise<IIntegrationFormMapping[]> {
  const creds = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
  if (!creds) {
    throw new CrmIntegrationError(500, "MISSING_CREDENTIALS", "Could not decrypt credentials");
  }

  const adapter = getAdapter(integration.platform);

  const validation = await adapter.validateConnection(creds);
  if (!validation.ok) {
    await WebsiteIntegrationModel.updateStatus(
      integration.id,
      "revoked",
      validation.errorMessage ?? validation.error ?? "Token validation failed",
    );
    throw new CrmIntegrationError(401, "TOKEN_REJECTED", "Token rejected during validation");
  }

  const forms = await adapter.listForms(creds);
  const validVendorIds = forms.map((f) => f.id);

  await IntegrationFormMappingModel.bulkMarkBrokenForMissingVendorForms(
    integration.id,
    validVendorIds,
  );
  await IntegrationFormMappingModel.bulkMarkValidated(integration.id, validVendorIds);
  await WebsiteIntegrationModel.updateLastValidated(integration.id, new Date());

  return IntegrationFormMappingModel.findByIntegrationId(integration.id);
}

/**
 * Suggest a default field mapping between a detected website form and a vendor
 * form. Throws on invalid input, missing credentials, or unknown vendor form.
 */
export async function inferMapping(
  projectId: string,
  integration: IWebsiteIntegrationSafe,
  input: { website_form_name?: string; vendor_form_id?: string },
): Promise<InferMappingResult> {
  const { website_form_name, vendor_form_id } = input;
  if (!website_form_name || !vendor_form_id) {
    throw new CrmIntegrationError(
      400,
      "INVALID_INPUT",
      "website_form_name and vendor_form_id are required",
    );
  }

  const creds = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
  if (!creds) {
    throw new CrmIntegrationError(500, "MISSING_CREDENTIALS", "Could not decrypt credentials");
  }

  const adapter = getAdapter(integration.platform);
  const form = await adapter.getFormSchema(creds, vendor_form_id);
  if (!form) {
    throw new CrmIntegrationError(404, "VENDOR_FORM_NOT_FOUND", "Vendor form not found");
  }

  const fieldShape = await formDetection.getFormFieldShape(projectId, website_form_name);
  const websiteFieldKeys = fieldShape.map((f) => f.key);

  const inferred = inferFieldMapping(websiteFieldKeys, form.fields);
  return {
    vendor_form: form,
    website_fields: fieldShape,
    inferred_mapping: inferred,
  };
}
