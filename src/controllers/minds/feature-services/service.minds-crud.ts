import { MindModel, IMind } from "../../../models/MindModel";
import {
  MindVersionModel,
  IMindVersion,
} from "../../../models/MindVersionModel";
import { MindSyncRunModel } from "../../../models/MindSyncRunModel";
import { db } from "../../../database/connection";
import { regenerateEmbeddings } from "./service.minds-embedding";
import { shouldUseRag } from "./service.minds-retrieval";
import logger from "../../../lib/logger";

export async function listMinds(): Promise<IMind[]> {
  return MindModel.listAll();
}

export async function getMind(
  mindId: string,
): Promise<IMind & { published_version?: IMindVersion }> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  let published_version: IMindVersion | undefined;
  if (mind.published_version_id) {
    published_version = await MindVersionModel.findById(
      mind.published_version_id,
    );
  }

  return { ...mind, published_version };
}

export async function createMind(
  name: string,
  personalityPrompt: string,
): Promise<IMind> {
  const existing = await MindModel.findByName(name);
  if (existing) throw new Error("A mind with this name already exists");

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return MindModel.create({
    name,
    slug,
    personality_prompt: personalityPrompt,
  });
}

export async function deleteMind(mindId: string): Promise<void> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const hasActive = await MindSyncRunModel.hasActiveRun(mindId);
  if (hasActive) {
    throw new Error("Cannot delete mind while a sync run is in progress");
  }

  // All child tables have ON DELETE CASCADE
  await MindModel.deleteById(mindId);
  logger.info(`[MINDS] Deleted mind ${mind.name} (${mindId})`);
}

export async function updateMind(
  mindId: string,
  data: { name?: string; personality_prompt?: string },
): Promise<IMind> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  if (data.name && data.name !== mind.name) {
    const existing = await MindModel.findByName(data.name);
    if (existing) throw new Error("A mind with this name already exists");
  }

  await MindModel.updateById(mindId, data);
  return MindModel.findById(mindId);
}

export async function updateBrain(
  mindId: string,
  brainMarkdown: string,
  adminId?: string,
): Promise<{ version: IMindVersion; warning?: string }> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const version = await db.transaction(async (trx) => {
    const v = await MindVersionModel.createVersion(
      mindId,
      brainMarkdown,
      adminId,
      trx,
    );
    await MindModel.setPublishedVersion(mindId, v.id, trx);
    return v;
  });

  logger.info(
    `[MINDS] Brain updated for mind ${mindId}: version ${version.version_number}, ${brainMarkdown.length} chars`,
  );

  // Regenerate RAG embeddings if brain is large enough
  if (shouldUseRag(brainMarkdown.length)) {
    try {
      await regenerateEmbeddings(mindId, version.id, brainMarkdown, mind.name);
    } catch (err) {
      logger.error({ err: err }, "[MINDS] Embedding regeneration failed (non-blocking):");
      // Non-blocking — brain update still succeeds, RAG will fall back to full brain
    }
  }

  return { version };
}

export async function listVersions(mindId: string): Promise<IMindVersion[]> {
  return MindVersionModel.listByMind(mindId);
}

export async function publishVersion(
  mindId: string,
  versionId: string,
): Promise<void> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const version = await MindVersionModel.findById(versionId);
  if (!version) throw new Error("Version not found");
  if (version.mind_id !== mindId)
    throw new Error("Version does not belong to this mind");

  await MindModel.setPublishedVersion(mindId, versionId);
  logger.info(
    `[MINDS] Published version ${version.version_number} for mind ${mindId}`,
  );

  // Regenerate RAG embeddings for the published version
  if (shouldUseRag(version.brain_markdown.length)) {
    try {
      const mind = await MindModel.findById(mindId);
      await regenerateEmbeddings(
        mindId,
        versionId,
        version.brain_markdown,
        mind?.name || "Unknown",
      );
    } catch (err) {
      logger.error({ err: err }, "[MINDS] Embedding regeneration failed (non-blocking):");
    }
  }
}
