import { Request, Response } from "express";
import * as formDetection from "./feature-services/service.form-detection";
import { upsertFormCatalogPreferences } from "../../services/formCatalogPreferenceService";
import { upsertFormRecipientRule } from "../../services/formRecipientRuleService";
import logger from "../../lib/logger";

function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
): Response {
  return res.status(status).json({ success: false, error: code, message });
}

export async function listFormCatalog(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const data = await formDetection.listFormCatalog(projectId);
    return ok(res, data);
  } catch (error) {
    logger.error({ err: error }, "[Website Forms] listFormCatalog failed:");
    return fail(res, 500, "FETCH_ERROR", "Failed to list website forms");
  }
}

export async function updateFormRecipientRule(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const { formName, recipients, isEnabled } = req.body as {
      formName?: unknown;
      recipients?: unknown;
      isEnabled?: unknown;
    };

    const data = await upsertFormRecipientRule({
      projectId,
      formName,
      recipients,
      isEnabled,
    });

    return ok(res, data);
  } catch (error: any) {
    if (typeof error?.statusCode === "number") {
      return fail(
        res,
        error.statusCode,
        error.code || "FORM_RECIPIENT_RULE_ERROR",
        error.message || "Failed to update form recipients",
      );
    }

    logger.error({ err: error }, "[Website Forms] updateFormRecipientRule failed:");
    return fail(
      res,
      500,
      "UPDATE_ERROR",
      "Failed to update form recipients",
    );
  }
}

export async function updateFormPreferences(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const data = await upsertFormCatalogPreferences({
      projectId,
      preferences: req.body?.preferences,
    });

    return ok(res, data);
  } catch (error: any) {
    if (typeof error?.statusCode === "number") {
      return fail(
        res,
        error.statusCode,
        error.code || "FORM_CATALOG_PREFERENCES_ERROR",
        error.message || "Failed to update form preferences",
      );
    }

    logger.error({ err: error }, "[Website Forms] updateFormPreferences failed:");
    return fail(
      res,
      500,
      "UPDATE_ERROR",
      "Failed to update form preferences",
    );
  }
}
