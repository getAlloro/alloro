import { Request, Response } from "express";
import { MindSyncProposalModel } from "../../models/MindSyncProposalModel";
import logger from "../../lib/logger";

export async function updateProposal(req: Request, res: Response): Promise<any> {
  try {
    const { proposalId } = req.params;
    const { status } = req.body;

    const allowed = ["approved", "rejected", "pending"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
    }

    const proposal = await MindSyncProposalModel.findById(proposalId);
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });

    // Validate state transition
    const validTransitions: Record<string, string[]> = {
      pending: ["approved", "rejected"],
      approved: ["rejected", "pending"],
      rejected: ["pending"],
    };
    const currentStatus = proposal.status;
    if (!validTransitions[currentStatus]?.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from "${currentStatus}" to "${status}"`,
      });
    }

    await MindSyncProposalModel.updateStatus(proposalId, status);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error updating proposal:");
    return res.status(500).json({ error: "Failed to update proposal" });
  }
}
