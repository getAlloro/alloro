export interface GbpContentSafetyResult {
  isSafe: boolean;
  status: "safe" | "needs_review" | "blocked";
  reasonCodes: string[];
  reasons: string[];
  byteLength: number;
  confidence: number;
}

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

const BLOCKED_CLAIMS = [
  /\bguarantee\b/i,
  /\bguaranteed\b/i,
  /\bcure\b/i,
  /\bpain[- ]?free\b/i,
  /\bpermanent results?\b/i,
  /\bmedical advice\b/i,
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

    for (const pattern of BLOCKED_PATIENT_CONFIRMATION) {
      if (pattern.test(trimmed)) {
        reasonCodes.push("private_detail_confirmation");
        reasons.push("Reply appears to confirm patient relationship or private details.");
        break;
      }
    }

    for (const pattern of BLOCKED_CLAIMS) {
      if (pattern.test(trimmed)) {
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

    const needsReview = NEEDS_REVIEW_PATTERNS.some((pattern) => pattern.test(trimmed));
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
