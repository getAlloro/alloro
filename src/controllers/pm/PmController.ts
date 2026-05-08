import { Request, Response } from "express";
import { db } from "../../database/connection";

function placeholder(_req: Request, res: Response): any {
  return res.json({ success: true, data: [] });
}

function placeholderSingle(_req: Request, res: Response): any {
  return res.json({ success: true, data: null });
}

// AI Synth (placeholder until Phase 4)
export const extractTasks = placeholderSingle;
export const batchCreateTasks = placeholder;

// Daily Brief (placeholder until Phase 5)
export const getLatestBrief = placeholderSingle;
export const getBriefHistory = placeholder;

// Activity (placeholder until Phase 3)
export const getGlobalActivity = placeholder;
export const getProjectActivity = placeholder;

// Stats (placeholder until Phase 3)
export const getStats = placeholderSingle;

// Users — returns admin emails from SUPER_ADMIN_EMAILS env var
export async function listUsers(_req: Request, res: Response): Promise<any> {
  try {
    const emails = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    const dbUsers = await db("users")
      .whereIn("email", emails)
      .select("id", "email");

    const userMap = new Map<string, number>(
      dbUsers.map((u: any) => [u.email.toLowerCase(), Number(u.id)])
    );

    const users = emails
      .map((email) => ({
        id: userMap.get(email) ?? null,
        email,
        display_name: email.split("@")[0],
      }))
      .filter((u) => u.id !== null);

    return res.json({ success: true, data: users });
  } catch (error) {
    console.error("[PM-USERS] listUsers failed:", error);
    return res.status(500).json({ success: false, error: "Failed to list users" });
  }
}
