import express from "express";
import { ReceiptsReportController } from "../../controllers/receipts-report/ReceiptsReportController";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { validate } from "../../middleware/validate";
import {
  receiptsReportParamsSchema,
  receiptsReportQuerySchema,
} from "../../validation/receiptsReport";

const router = express.Router();
const enforce = { mode: "enforce" as const };

router.use(authenticateToken, superAdminMiddleware);

router.get(
  "/organizations/:organizationId",
  validate(receiptsReportParamsSchema, { target: "params", ...enforce }),
  validate(receiptsReportQuerySchema, { target: "query", ...enforce }),
  ReceiptsReportController.getReport
);

export default router;
