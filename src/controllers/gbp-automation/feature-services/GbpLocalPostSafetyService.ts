import { GbpContentSafetyResult } from "./GbpContentSafetyService";

const MAX_LOCAL_POST_CHARS = 1500;

const BLOCKED_PRIVATE_DETAIL_PATTERNS = [
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
  /\bwe treated\b/i,
];

const BLOCKED_CLAIM_PATTERNS = [
  /\bguarantee\b/i,
  /\bguaranteed\b/i,
  /\bcure\b/i,
  /\bpain[- ]?free\b/i,
  /\bpermanent results?\b/i,
  /\bmedical advice\b/i,
  /\blimited time emergency\b/i,
];

const NEEDS_REVIEW_PATTERNS = [
  /\broot canal\b/i,
  /\binfection\b/i,
  /\bpain\b/i,
  /\banxiety\b/i,
  /\bbilling\b/i,
  /\binsurance\b/i,
  /\bcomplaint\b/i,
];

export class GbpLocalPostSafetyService {
  static validateLocalPost(
    summary: string,
    featuredImageUrl?: string | null
  ): GbpContentSafetyResult {
    const reasons: string[] = [];
    const reasonCodes: string[] = [];
    const trimmed = summary.trim();
    const byteLength = Buffer.byteLength(trimmed, "utf8");

    if (!trimmed) {
      reasonCodes.push("required");
      reasons.push("Post summary is required.");
    }
    if (trimmed.length > MAX_LOCAL_POST_CHARS) {
      reasonCodes.push("local_post_character_limit");
      reasons.push("Post summary exceeds Google's 1500-character limit.");
    }
    if (!featuredImageUrl) {
      reasonCodes.push("featured_image_required");
      reasons.push("Post image is required before publishing a GBP post.");
    }

    for (const pattern of BLOCKED_PRIVATE_DETAIL_PATTERNS) {
      if (pattern.test(trimmed)) {
        reasonCodes.push("private_detail_confirmation");
        reasons.push("Post appears to confirm patient relationship or private details.");
        break;
      }
    }

    for (const pattern of BLOCKED_CLAIM_PATTERNS) {
      if (pattern.test(trimmed)) {
        reasonCodes.push("medical_or_outcome_claim");
        reasons.push("Post appears to make a medical or outcome claim.");
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

    const needsReview = NEEDS_REVIEW_PATTERNS.some((pattern) => pattern.test(trimmed));
    if (needsReview) {
      return {
        isSafe: true,
        status: "needs_review",
        reasonCodes: ["sensitive_healthcare_language"],
        reasons: [
          "Post is publishable but includes sensitive healthcare language. Preview before deploying.",
        ],
        byteLength,
        confidence: 72,
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
