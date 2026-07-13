import type { PmsParserResult } from "../feature-utils/pmsParserContract";

export interface PersistedPmsParserMetadata {
  parser_type: PmsParserResult["parserType"];
  referral_count_semantics: PmsParserResult["countSemantics"]["referralCount"];
  source_referral_count_semantics: PmsParserResult["countSemantics"]["sourceReferralCount"];
  requires_sanitization: boolean;
}

export function buildPersistedPmsParserMetadata(
  result: PmsParserResult,
): PersistedPmsParserMetadata {
  return {
    parser_type: result.parserType,
    referral_count_semantics: result.countSemantics.referralCount,
    source_referral_count_semantics: result.countSemantics.sourceReferralCount,
    requires_sanitization: result.requiresSanitization,
  };
}
