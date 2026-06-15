/**
 * Audit Workflow Service
 *
 * Kicks off a leadgen audit by:
 *   1. Creating an `audit_processes` row with status=pending, realtime_status=0.
 *   2. Enqueueing a BullMQ job on the `audit-leadgen` queue.
 *   3. Returning the audit id to the controller (frontend poll contract).
 *
 * Replaces the previous n8n `WEB_SCRAPING_TOOL_AGENT_WEBHOOK` relay. The
 * heavy orchestration now lives in
 * `src/workers/processors/auditLeadgen.processor.ts`.
 */

import { randomUUID } from "crypto";
import { AuditProcessModel } from "../../../models/AuditProcessModel";
import { getAuditQueue } from "../../../workers/queues";
import logger from "../../../lib/logger";

export async function triggerAuditWorkflow(
  domain: string,
  practiceSearchString: string
): Promise<string> {
  const auditId = randomUUID();

  await AuditProcessModel.create({
    id: auditId,
    domain,
    practice_search_string: practiceSearchString,
    status: "pending",
    realtime_status: 0,
  });

  const queue = getAuditQueue("leadgen");
  await queue.add("process", {
    auditId,
    domain,
    practiceSearchString,
  });

  logger.info(`[Audit] Enqueued audit job ${auditId} for domain=${domain}`);

  return auditId;
}
