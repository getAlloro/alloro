import type { Request, Response } from "express";
import { AdminSettingModel } from "../../models/website-builder/AdminSettingModel";
import { SettingsTransformService } from "./services/settings-transform.service";
import { SettingsValidator } from "./utils/settings-validator.util";
import logger from "../../lib/logger";

export class AdminSettingsController {
  static async getAllSettings(_req: Request, res: Response): Promise<Response> {
    try {
      const rows = await AdminSettingModel.findAll();
      const data = SettingsTransformService.groupByCategory(rows);
      return res.json({ success: true, data });
    } catch (error: any) {
      logger.error({ err: error }, "[Admin Settings] Error fetching settings:");
      return res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message: error?.message || "Failed to fetch settings",
      });
    }
  }

  static async getSetting(req: Request, res: Response): Promise<Response> {
    try {
      const { category, key } = req.params;

      const row = await AdminSettingModel.findByCategoryAndKey(category, key);

      if (!row) {
        return res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: `Setting ${category}/${key} not found`,
        });
      }

      return res.json({ success: true, data: row });
    } catch (error: any) {
      logger.error({ err: error }, "[Admin Settings] Error fetching setting:");
      return res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message: error?.message || "Failed to fetch setting",
      });
    }
  }

  static async upsertSetting(req: Request, res: Response): Promise<Response> {
    try {
      const { category, key } = req.params;
      const { value } = req.body;

      const validation = SettingsValidator.validateValue(value);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: "INVALID_INPUT",
          message: validation.error,
        });
      }

      const row = await AdminSettingModel.upsert(category, key, value);

      logger.info(`[Admin Settings] Updated ${category}/${key}`);

      return res.json({ success: true, data: row });
    } catch (error: any) {
      logger.error({ err: error }, "[Admin Settings] Error updating setting:");
      return res.status(500).json({
        success: false,
        error: "UPDATE_ERROR",
        message: error?.message || "Failed to update setting",
      });
    }
  }
}
