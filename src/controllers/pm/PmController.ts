import { Request, Response } from "express";
import { UserModel } from "../../models/UserModel";
import logger from "../../lib/logger";

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

type PmUserRow = {
  id: number | string;
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
};

function displayNameForUser(user: PmUserRow, fallbackEmail: string): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.name || fallbackEmail.split("@")[0];
}

// Users — the internal Alloro roster (users.is_internal), DB-driven. Replaces
// the SUPER_ADMIN_EMAILS env roster so new @getalloro admins appear automatically.
export async function listUsers(_req: Request, res: Response): Promise<any> {
  try {
    const dbUsers: PmUserRow[] = await UserModel.listInternalUsers();

    const users = dbUsers.map((user) => ({
      id: Number(user.id),
      email: user.email,
      display_name: displayNameForUser(user, user.email),
    }));

    return res.json({ success: true, data: users });
  } catch (error) {
    logger.error({ err: error }, "[PM-USERS] listUsers failed:");
    return res.status(500).json({ success: false, error: "Failed to list users" });
  }
}
