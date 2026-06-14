import { Request, Response } from "express";
import { MindModel } from "../../models/MindModel";
import { MindSkillModel } from "../../models/MindSkillModel";
import { MindSkillNeuronModel } from "../../models/MindSkillNeuronModel";
import { MindSkillCallModel } from "../../models/MindSkillCallModel";
import logger from "../../lib/logger";

export async function getSkillNeuron(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    const { agentSlug, skillSlug } = req.params;
    const callerIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    const mind = await MindModel.findBySlug(agentSlug);
    if (!mind) return res.status(404).json({ error: "Agent not found" });

    const skill = await MindSkillModel.findBySlug(mind.id, skillSlug);
    if (!skill) return res.status(404).json({ error: "Skill not found" });
    if (skill.status !== "ready")
      return res.status(400).json({ error: "Skill is not ready" });

    const neuron = await MindSkillNeuronModel.findBySkill(skill.id);
    if (!neuron)
      return res.status(404).json({ error: "Skill neuron not generated" });

    const startTime = Date.now();

    // Log the call for analytics
    await MindSkillCallModel.log(
      skill.id,
      callerIp,
      req.body || {},
      { delivered: true },
      "success",
      Date.now() - startTime,
    );

    // Return the neuron as plain text
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(neuron.neuron_markdown);
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Skill API error:");
    return res.status(500).json({ error: "Skill endpoint failed" });
  }
}
