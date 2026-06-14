import { AuditProcessModel } from "../../../models/AuditProcessModel";
import { db } from "../../../database/connection";
import logger from "../../../lib/logger";

export async function updateAuditFields(
  auditId: string,
  filteredData: Record<string, any>
): Promise<string[]> {
  logger.info({ detail: Object.keys(filteredData) }, `[Audit] Updating ${auditId} with:`);

  // Special-case `realtime_status`: since multiple parallel branches
  // (Branch B website analysis, C2 self GBP, C3 competitor GBP) write this
  // column in arbitrary completion order, we must NEVER downgrade it.
  // Without GREATEST a slow Branch B finishing after C2 would flip
  // realtime_status from 3 back to 2 — which makes the frontend rewind
  // its UI stage (and skip past competitor_map entirely on the next jump).
  if ("realtime_status" in filteredData) {
    const rt = filteredData.realtime_status;
    const rest = { ...filteredData };
    delete rest.realtime_status;
    await db("audit_processes")
      .where({ id: auditId })
      .update({
        ...rest,
        realtime_status: db.raw("GREATEST(realtime_status, ?)", [rt]),
        updated_at: db.fn.now(),
      });
  } else {
    await AuditProcessModel.updateById(auditId, filteredData);
  }

  return Object.keys(filteredData);
}
