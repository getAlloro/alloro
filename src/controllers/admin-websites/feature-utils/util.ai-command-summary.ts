/**
 * AI Command — execution summary
 *
 * Builds the structured markdown summary stored on a batch after execution
 * (completed / needs-visual-check / manual / failed sections). Extracted from
 * `service.ai-command.ts` as part of a behavior-preserving decomposition;
 * logic and output are unchanged.
 */

import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";

export function getStructuralIcon(targetType: string): string {
  switch (targetType) {
    case "create_page": return "📄";
    case "create_post": return "📝";
    case "create_redirect": case "update_redirect": case "delete_redirect": return "🔀";
    case "create_menu": case "update_menu": return "📋";
    case "update_post_meta": return "📝";
    case "update_page_path": return "📄";
    default: return "✅";
  }
}

export async function buildExecutionSummary(batchId: string): Promise<string> {
  const allRecs = await AiCommandRecommendationModel.findByBatchId(batchId);

  const executed = allRecs.filter((r: any) => r.status === "executed");
  const failed = allRecs.filter((r: any) => r.status === "failed");
  const rejected = allRecs.filter((r: any) => r.status === "rejected");

  // Categorize executed items
  const htmlEditTypes = ["page_section", "layout", "post"];
  const htmlEdits = executed.filter((r: any) => htmlEditTypes.includes(r.target_type));
  const structural = executed.filter((r: any) => !htmlEditTypes.includes(r.target_type));

  // Items needing visual check (had remaining validation issues)
  const needsVisualCheck = htmlEdits.filter((r: any) => {
    try {
      const result = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
      return result?.remaining_issues > 0;
    } catch { return false; }
  });

  // Manual action items (rejected with MANUAL flag)
  const manualItems = rejected.filter((r: any) => {
    return r.recommendation?.includes("MANUAL:") || r.recommendation?.includes("manual_action");
  });

  const lines: string[] = [];

  // Overview
  lines.push(`**${executed.length}** completed, **${failed.length}** failed, **${rejected.length}** skipped\n`);

  // Completed
  if (htmlEdits.length > 0 || structural.length > 0) {
    lines.push("### Completed");
    for (const r of htmlEdits) lines.push(`- ✏️ ${r.target_label}`);
    for (const r of structural) lines.push(`- ${getStructuralIcon(r.target_type)} ${r.target_label}`);
    lines.push("");
  }

  // Needs Visual Check
  if (needsVisualCheck.length > 0) {
    lines.push("### Needs Visual Check");
    for (const r of needsVisualCheck) {
      try {
        const result = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
        lines.push(`- 👁️ ${r.target_label} — ${result.remaining_issues} unresolved issue(s)`);
      } catch {
        lines.push(`- 👁️ ${r.target_label}`);
      }
    }
    lines.push("");
  }

  // Manual Action Required
  if (manualItems.length > 0) {
    lines.push("### Manual Action Required");
    for (const r of manualItems) lines.push(`- 🔧 ${r.target_label} — ${r.recommendation}`);
    lines.push("");
  }

  // Failed
  if (failed.length > 0) {
    lines.push("### Failed");
    for (const r of failed) {
      try {
        const result = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
        lines.push(`- ❌ ${r.target_label} — ${result?.error || "Unknown error"}`);
      } catch {
        lines.push(`- ❌ ${r.target_label}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
