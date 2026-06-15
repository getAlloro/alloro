/**
 * System prompt for the visual page editor LLM.
 *
 * Loads the format envelope and editor prompts from markdown agent files.
 * Falls back to admin_settings DB rows if they exist (for backwards compat).
 *
 * The FORMAT_ENVELOPE from PageEditorFormat.md enforces output format rules.
 * It wraps the editor prompt and cannot be diluted by prompt edits.
 */

import { AdminSettingModel } from "../../models/website-builder/AdminSettingModel";
import { loadPrompt } from "../../agents/service.prompt-loader";

export async function getPageEditorPrompt(promptType: "admin" | "user" = "admin"): Promise<string> {
  const formatEnvelope = loadPrompt("websiteAgents/PageEditorFormat");

  // Try DB first (admin-configurable override)
  const key = promptType === "admin"
    ? "admin_editing_system_prompt"
    : "user_editing_system_prompt";

  let editorPrompt: string | null = null;

  try {
    const row = await AdminSettingModel.findByCategoryAndKey("websites", key);
    if (row?.value?.trim()) {
      editorPrompt = row.value;
    }
  } catch {
    // DB not available or table doesn't exist — fall through to file
  }

  // Fallback to markdown agent file
  if (!editorPrompt) {
    const agentFile = promptType === "admin"
      ? "websiteAgents/PageEditorAdmin"
      : "websiteAgents/PageEditorUser";
    editorPrompt = loadPrompt(agentFile);
  }

  return formatEnvelope + "\n\n" + editorPrompt;
}
