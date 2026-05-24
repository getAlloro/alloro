/**
 * Pre-Commit Voice Check
 *
 * Wraps the existing runtime voice checker at
 * src/services/narrator/voiceConstraints.ts. Per Fireflies spec section 8,
 * the committer runs this against approver-edited bullet text BEFORE the
 * write lands in Section 2. This is the one BLOCK (not FLAG) point in the
 * pipeline: the substrate carries doctrine and must pass its own rules
 * per the 2026-05-23 "doctrine applies to its enforcers" rule
 * (State of Now Section 4, entry locked 2026-05-23).
 *
 * BLOCK behavior: returns a result object with passed=false and the list
 * of violations. The committer surfaces these to the approver and refuses
 * to write the offending bullet until they re-edit.
 */

import { checkVoice, type VoiceCheckResult } from "../narrator/voiceConstraints";

/**
 * Re-exported for callers; identical semantics to the runtime narrator
 * check.
 */
export { checkVoice };
export type { VoiceCheckResult };

/**
 * Check an array of bullet texts; returns the first failing one (if any)
 * along with its violations. Returns null if all bullets pass.
 */
export function findFirstVoiceFailure(
  bullets: Array<{ customer: string; rendered_text: string }>,
): { customer: string; bullet: string; result: VoiceCheckResult } | null {
  for (const b of bullets) {
    const result = checkVoice(b.rendered_text);
    if (!result.passed) {
      return { customer: b.customer, bullet: b.rendered_text, result };
    }
  }
  return null;
}
