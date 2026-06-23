/**
 * Prompt Placeholder Substituter
 *
 * Replaces {{token}} placeholders in an agent prompt with the org-type-aware
 * vocabulary from config/orgLabels (Code Constitution §6.2, §4.2). Tokens are
 * hand-placed in prompt *prose only* — JSON schema keys/examples never carry
 * tokens, so agent output parsing is unaffected.
 *
 * Fail-safe: an unknown token is left in place and logged (not thrown), so a
 * prompt-authoring typo can never break a live agent run. Unit tests assert
 * that every known token resolves per org type.
 */

import { OrgType, resolveLabels } from "../config/orgLabels";
import logger from "../lib/logger";

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

/**
 * Substitute {{token}} placeholders in `prompt` with the vocabulary for
 * `orgType`. Prompts with no tokens pass through unchanged.
 */
export function substitutePromptPlaceholders(
  prompt: string,
  orgType: OrgType
): string {
  const labels = resolveLabels(orgType);
  return prompt.replace(PLACEHOLDER_RE, (match, key: string) => {
    const value = labels[key];
    if (value === undefined) {
      logger.warn(
        `[promptSubstituter] Unknown placeholder ${match} (orgType=${orgType}) — left in place`
      );
      return match;
    }
    return value;
  });
}
