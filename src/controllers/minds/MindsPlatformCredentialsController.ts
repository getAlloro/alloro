import { Request, Response } from "express";
import { PlatformCredentialModel } from "../../models/PlatformCredentialModel";
import logger from "../../lib/logger";

// =====================================================================
// LIST — GET /api/minds/:mindId/credentials
// =====================================================================

export async function listCredentials(
  req: Request,
  res: Response
): Promise<any> {
  try {
    const { mindId } = req.params;
    const credentials = await PlatformCredentialModel.listByMind(mindId);
    return res.json(credentials);
  } catch (error: any) {
    logger.error({ err: error }, "[CREDENTIALS] List error:");
    return res.status(500).json({ error: "Failed to list credentials" });
  }
}

// =====================================================================
// CREATE — POST /api/minds/:mindId/credentials
// =====================================================================

export async function createCredential(
  req: Request,
  res: Response
): Promise<any> {
  try {
    const { mindId } = req.params;
    const { platform, label, credentials, credential_type } = req.body;

    if (!platform || typeof platform !== "string") {
      return res.status(400).json({ error: "platform is required" });
    }
    if (!credentials || typeof credentials !== "string") {
      return res.status(400).json({ error: "credentials is required" });
    }

    const created = await PlatformCredentialModel.create({
      mind_id: mindId,
      platform,
      label: label || null,
      credentials,
      credential_type: credential_type || "api_key",
    });

    // Strip encrypted_credentials before returning
    const { encrypted_credentials, ...safe } = created;
    return res.status(201).json(safe);
  } catch (error: any) {
    logger.error({ err: error }, "[CREDENTIALS] Create error:");
    return res.status(500).json({ error: "Failed to create credential" });
  }
}

// =====================================================================
// UPDATE — PUT /api/minds/:mindId/credentials/:credentialId
// =====================================================================

export async function updateCredential(
  req: Request,
  res: Response
): Promise<any> {
  try {
    const { credentialId } = req.params;
    const { label, status } = req.body;

    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    await PlatformCredentialModel.updateById(credentialId, updates);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[CREDENTIALS] Update error:");
    return res.status(500).json({ error: "Failed to update credential" });
  }
}

// =====================================================================
// DELETE — DELETE /api/minds/:mindId/credentials/:credentialId
// =====================================================================

export async function deleteCredential(
  req: Request,
  res: Response
): Promise<any> {
  try {
    const { credentialId } = req.params;
    await PlatformCredentialModel.deleteById(credentialId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[CREDENTIALS] Delete error:");
    return res.status(500).json({ error: "Failed to delete credential" });
  }
}

// =====================================================================
// REVOKE — POST /api/minds/:mindId/credentials/:credentialId/revoke
// =====================================================================

export async function revokeCredential(
  req: Request,
  res: Response
): Promise<any> {
  try {
    const { credentialId } = req.params;
    await PlatformCredentialModel.updateById(credentialId, {
      status: "revoked",
    });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[CREDENTIALS] Revoke error:");
    return res.status(500).json({ error: "Failed to revoke credential" });
  }
}
