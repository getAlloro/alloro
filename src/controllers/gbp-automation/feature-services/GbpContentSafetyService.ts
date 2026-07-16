import {
  OUTCOME_CLAIM_PATTERNS,
  type ContentSafetyResult,
} from "../../../services/content-safety/GeneratedCopySafetyService";
import { normalizeForMatching } from "../../../services/content-safety/copyNormalization";
import { matchesUnnegatedInNormalizedCopy } from "../../../services/content-safety/claimNegation";

/**
 * GBP review-reply safety result. Alias of the neutral ContentSafetyResult so
 * every caller in this domain keeps handling one result type.
 */
export type GbpContentSafetyResult = ContentSafetyResult;

const MAX_GOOGLE_REPLY_BYTES = 4096;
const MAX_REVIEW_REPLY_CHARS = 900;

const BLOCKED_PATIENT_CONFIRMATION = [
  /\bour patient\b/i,
  /\bas a patient\b/i,
  /\byour appointment\b/i,
  /\byour treatment\b/i,
  /\byour procedure\b/i,
  /\byour diagnosis\b/i,
  /\byour records?\b/i,
  /\byour insurance\b/i,
  /\byour bill\b/i,
  /\byour case\b/i,
  /\btreated you\b/i,
  /\bseeing you\b/i,
];

const NEEDS_REVIEW_PATTERNS = [
  /\bsorry\b/i,
  /\bconcern/i,
  /\bfrustrat/i,
  /\bupset\b/i,
  /\bdisappoint/i,
  /\bcall\b/i,
  /\bcontact\b/i,
  /\bresolve\b/i,
];

export class GbpContentSafetyService {
  static validateReviewReply(content: string): GbpContentSafetyResult {
    const reasons: string[] = [];
    const reasonCodes: string[] = [];
    const trimmed = content.trim();
    const byteLength = Buffer.byteLength(trimmed, "utf8");

    // This gate's patterns are ASCII, so the same encoding fold the generated-copy
    // gate needs applies here: a zero-width character or a homoglyph inside
    // "guarantee" renders identically and defeats every pattern below.
    //
    // The LIMITS above stay measured on `trimmed`, never on the normalized text:
    // Google's 4096-byte ceiling and Alloro's 900-character ceiling apply to the
    // reply that actually ships. Only MATCHING reads the normalized view.
    const normalized = normalizeForMatching(trimmed);

    if (!trimmed) {
      reasonCodes.push("required");
      reasons.push("Reply content is required.");
    }
    if (byteLength > MAX_GOOGLE_REPLY_BYTES) {
      reasonCodes.push("google_byte_limit");
      reasons.push("Reply exceeds Google's 4096-byte limit.");
    }
    if (trimmed.length > MAX_REVIEW_REPLY_CHARS) {
      reasonCodes.push("reply_character_limit");
      reasons.push("Reply exceeds Alloro's 900-character review reply limit.");
    }

    // PRIVACY patterns stay a RAW match, deliberately. Negation does not make a
    // reference to a reviewer's care safe to publish: "we cannot discuss your
    // treatment" still confirms there was treatment, so a negated match is as
    // disclosing as a bare one. This gate's asymmetry runs the other way from the
    // honesty gate's — the harm is the publish, not the block — so it stays
    // conservative and the reply goes back for a human edit.
    for (const pattern of BLOCKED_PATIENT_CONFIRMATION) {
      if (pattern.test(normalized)) {
        reasonCodes.push("private_detail_confirmation");
        reasons.push("Reply appears to confirm patient relationship or private details.");
        break;
      }
    }

    // HONESTY patterns route through the SHARED negation-aware matcher, the same
    // one validateGeneratedCopy uses. Testing these patterns raw was a silent
    // over-block: `OUTCOME_CLAIM_PATTERNS` contains a bare `\bguarantee\b`, so
    // every honest disclaimer a practice could write — "we don't guarantee a
    // higher ranking" — was blocked by the word it needs to say in order to
    // disclaim. The gate refused to print the disclaimer that IS the product.
    //
    // Sharing the inventory without sharing the matcher is what made this
    // possible: the fix to the negation model landed in the shared service and
    // this path never called it. The two now cannot drift apart again.
    for (const pattern of OUTCOME_CLAIM_PATTERNS) {
      if (matchesUnnegatedInNormalizedCopy(normalized, pattern)) {
        reasonCodes.push("medical_or_outcome_claim");
        reasons.push("Reply appears to make a medical or outcome claim.");
        break;
      }
    }

    if (reasonCodes.length > 0) {
      return {
        isSafe: false,
        status: "blocked",
        reasonCodes,
        reasons,
        byteLength,
        confidence: 95,
      };
    }

    const needsReview = NEEDS_REVIEW_PATTERNS.some((pattern) => pattern.test(normalized));
    if (needsReview) {
      return {
        isSafe: true,
        status: "needs_review",
        reasonCodes: ["sensitive_or_service_recovery_language"],
        reasons: [
          "Reply is publishable but includes sensitive or service-recovery language. Preview before deploying.",
        ],
        byteLength,
        confidence: 70,
      };
    }

    return {
      isSafe: true,
      status: "safe",
      reasonCodes: [],
      reasons: [],
      byteLength,
      confidence: 90,
    };
  }
}
