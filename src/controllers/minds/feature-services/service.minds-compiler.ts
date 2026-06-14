import { MindModel } from "../../../models/MindModel";
import { MindVersionModel } from "../../../models/MindVersionModel";
import { MindSyncProposalModel, IMindSyncProposal } from "../../../models/MindSyncProposalModel";
import { MindDiscoveryBatchModel } from "../../../models/MindDiscoveryBatchModel";
import { MindDiscoveredPostModel } from "../../../models/MindDiscoveredPostModel";
import { db } from "../../../database/connection";
import logger from "../../../lib/logger";

const DEFAULT_BRAIN_SCAFFOLD = `# Knowledge Base

## Core Concepts
- (Add core concepts here)

## Recently Added Insights
- (Newly accepted proposals will be appended here)
`;

export interface CompileResult {
  newBrain: string;
  appliedCount: number;
  skippedCount: number;
  warnings: string[];
}

export function applyProposals(
  currentBrain: string,
  proposals: IMindSyncProposal[]
): CompileResult {
  let brain = currentBrain;
  let appliedCount = 0;
  let skippedCount = 0;
  const warnings: string[] = [];

  for (const proposal of proposals) {
    if (proposal.type === "NEW") {
      // Append under "## Recently Added Insights"
      const insertionPoint = brain.indexOf("## Recently Added Insights");
      if (insertionPoint !== -1) {
        const afterHeader = brain.indexOf("\n", insertionPoint);
        if (afterHeader !== -1) {
          brain =
            brain.slice(0, afterHeader + 1) +
            `\n${proposal.proposed_text}\n` +
            brain.slice(afterHeader + 1);
        } else {
          brain += `\n${proposal.proposed_text}\n`;
        }
      } else {
        // No section found — append at end with section header
        brain += `\n\n## Recently Added Insights\n\n${proposal.proposed_text}\n`;
      }
      appliedCount++;
    } else if (proposal.type === "UPDATE" || proposal.type === "CONFLICT") {
      if (!proposal.target_excerpt) {
        warnings.push(
          `Skipped proposal "${proposal.summary}": missing target_excerpt for ${proposal.type}`
        );
        skippedCount++;
        continue;
      }

      if (!brain.includes(proposal.target_excerpt)) {
        warnings.push(
          `Skipped proposal "${proposal.summary}": target_excerpt not found in current brain`
        );
        skippedCount++;
        continue;
      }

      brain = brain.replace(proposal.target_excerpt, proposal.proposed_text);
      appliedCount++;
    }
  }

  return { newBrain: brain, appliedCount, skippedCount, warnings };
}

export async function compileAndPublish(
  mindId: string,
  adminId?: string
): Promise<{
  version: { id: string; version_number: number };
  appliedCount: number;
  skippedCount: number;
  warnings: string[];
}> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  // Load current brain
  let currentBrain = DEFAULT_BRAIN_SCAFFOLD;
  if (mind.published_version_id) {
    const version = await MindVersionModel.findById(mind.published_version_id);
    if (version) currentBrain = version.brain_markdown;
  }

  // Get approved proposals
  const proposals = await MindSyncProposalModel.listApprovedByMind(mindId);
  if (proposals.length === 0) {
    throw new Error("No approved proposals to compile");
  }

  // Apply proposals
  const { newBrain, appliedCount, skippedCount, warnings } = applyProposals(
    currentBrain,
    proposals
  );

  // Create version and publish in transaction
  const version = await db.transaction(async (trx) => {
    const v = await MindVersionModel.createVersion(mindId, newBrain, adminId, trx);
    await MindModel.setPublishedVersion(mindId, v.id, trx);
    await MindSyncProposalModel.finalizeApproved(mindId, trx);

    // Check if batch can be closed
    const batch = await MindDiscoveryBatchModel.findOpenByMind(mindId, trx);
    if (batch) {
      const pendingCount = await MindDiscoveredPostModel.countByBatchAndStatus(
        batch.id,
        "pending",
        trx
      );
      const approvedCount = await MindDiscoveredPostModel.countByBatchAndStatus(
        batch.id,
        "approved",
        trx
      );
      if (pendingCount === 0 && approvedCount === 0) {
        await MindDiscoveryBatchModel.closeBatch(batch.id, trx);
        logger.info(`[MINDS] Closed batch ${batch.id} — no remaining pending/approved posts`);
      }
    }

    return v;
  });

  logger.info(
    `[MINDS] Compiled and published version ${version.version_number} for mind ${mindId}: ${appliedCount} applied, ${skippedCount} skipped, ${newBrain.length} chars`
  );

  return {
    version: { id: version.id, version_number: version.version_number },
    appliedCount,
    skippedCount,
    warnings,
  };
}
