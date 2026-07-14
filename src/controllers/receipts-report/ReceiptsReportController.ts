import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { ReceiptsReportService } from "./feature-services/ReceiptsReportService";
import {
  handleReceiptsReportError,
  ok,
} from "./feature-utils/controllerResponses";

const RECEIPTS_REPORT_ROUTE =
  "GET /api/admin/receipts-report/organizations/:organizationId";

/** Thin HTTP orchestration for the super-admin receipts report. */
export class ReceiptsReportController {
  static async getReport(
    req: AuthRequest,
    res: Response
  ): Promise<Response> {
    const organizationId = Number(req.params.organizationId);

    try {
      const report = await ReceiptsReportService.getReport({
        organizationId,
        startDate: String(req.query.startDate),
        endDate: String(req.query.endDate),
      });
      return ok(res, report);
    } catch (error) {
      return handleReceiptsReportError(res, error, {
        route: RECEIPTS_REPORT_ROUTE,
        userId: req.user?.userId ?? null,
        organizationId,
      });
    }
  }
}
