import type { PmsParserType } from "../../../config/pmsParserRegistry";
import type {
  MonthlyRollupForJob,
} from "../../../utils/pms/applyColumnMapping";
import type {
  MappingSource,
  ResolveResult,
} from "../../../utils/pms/resolveColumnMapping";

export type ReferralCountSemantics = "additive" | "unique_patient_global";
export type SourceReferralCountSemantics =
  | "additive"
  | "unique_patient_per_source";

export interface PmsCountSemantics {
  referralCount: ReferralCountSemantics;
  sourceReferralCount: SourceReferralCountSemantics;
}

export interface PmsParsedRow {
  source: string;
  type: "self" | "doctor";
  referrals: number;
  production: number;
  month: string;
}

export interface PmsMappingMetadata
  extends Omit<ResolveResult, "source"> {
  source: MappingSource | "legacy-template";
}

export interface PmsParserResult {
  parserType: PmsParserType;
  requiresSanitization: boolean;
  rows: PmsParsedRow[];
  rawRows: Record<string, unknown>[];
  monthlyRollup: MonthlyRollupForJob;
  warnings: string[];
  selectedSheetNames: string[];
  mappingMetadata?: PmsMappingMetadata;
  countSemantics: PmsCountSemantics;
}

interface PmsParseBaseInput {
  organizationId: number;
  targetMonth?: string;
  fallbackMonth?: string;
}

export interface PmsParseRowsInput extends PmsParseBaseInput {
  rows: Record<string, unknown>[];
}

export interface PmsParsePasteInput extends PmsParseBaseInput {
  rawText: string;
}

export interface PmsParseFileInput extends PmsParseBaseInput {
  file: Express.Multer.File;
}

export interface PmsParserAdapter {
  parseRows(input: PmsParseRowsInput): Promise<PmsParserResult>;
  parsePaste(input: PmsParsePasteInput): Promise<PmsParserResult>;
  parseFile(input: PmsParseFileInput): Promise<PmsParserResult>;
}

export const DEFAULT_COUNT_SEMANTICS: PmsCountSemantics = {
  referralCount: "additive",
  sourceReferralCount: "additive",
};

export const DENTALEMR_COUNT_SEMANTICS: PmsCountSemantics = {
  referralCount: "unique_patient_global",
  sourceReferralCount: "unique_patient_per_source",
};
