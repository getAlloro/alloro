import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { substitutePromptPlaceholders } from "../agents/service.prompt-substituter";
import type { OrgType } from "../config/orgLabels";

const ACTIVE_PROMPTS = [
  "monthlyAgents/ReferralEngineAnalysis",
  "monthlyAgents/Summary",
  "dailyAgents/Proofline",
  "monthlyAgents/PmsColumnMapper",
  "pmsAgents/PasteSanitizer",
  "gbpAgents/ReviewReply",
  "gbpAgents/LocalPost",
  "rankingAgents/Identifier",
] as const;

const GENERIC_FORBIDDEN_PATTERNS: RegExp[] = [
  /\bdental\/medical\b/i,
  /\bdental practice\b/i,
  /\bmedical practice\b/i,
  /\bdoctor's referral counts\b/i,
  /\bCall Dr\./i,
  /\bHeart of Texas Dentistry\b/i,
  /\bAltman Dental\b/i,
  /\bAltman Dentistry\b/i,
  /\bSouthern Smiles\b/i,
  /\bCox Dental\b/i,
  /\bDr\. Cox\b/i,
  /\bpatients\/mo\b/i,
  /\bpatient-specific\b/i,
  /\bprotected health information\b/i,
  /\btreatment specifics\b/i,
  /\bdiagnos(?:is|es)\b/i,
  /\bappointment details\b/i,
  /\bmedical\/billing\b/i,
  /\bdental PMS\b/i,
  /\bthe doctor\b/i,
];

function readPrompt(promptPath: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "src/agents", `${promptPath}.md`),
    "utf8"
  );
}

function renderPrompt(promptPath: string, orgType: OrgType): string {
  return substitutePromptPlaceholders(readPrompt(promptPath), orgType);
}

function removeVocabularyDirective(prompt: string): string {
  return prompt
    .split("\n")
    .filter((line) => !line.startsWith("VOCABULARY"))
    .join("\n");
}

describe("agent prompt org-type rendering", () => {
  it("renders every active prompt without unresolved placeholders", () => {
    for (const promptPath of ACTIVE_PROMPTS) {
      expect(renderPrompt(promptPath, "health"), promptPath).not.toMatch(/\{\{\w+\}\}/);
      expect(renderPrompt(promptPath, "generic"), promptPath).not.toMatch(/\{\{\w+\}\}/);
    }
  });

  it("keeps health prompt wording for healthcare orgs", () => {
    expect(renderPrompt("dailyAgents/Proofline", "health")).toContain(
      "tells the doctor what meaningfully"
    );
    expect(renderPrompt("monthlyAgents/PmsColumnMapper", "health")).toContain(
      "a dental practice's exported PMS file"
    );
    expect(renderPrompt("gbpAgents/ReviewReply", "health")).toContain(
      "protected health information"
    );
  });

  it("renders generic prompts with business vocabulary", () => {
    expect(renderPrompt("dailyAgents/Proofline", "generic")).toContain(
      "tells you what meaningfully"
    );
    expect(renderPrompt("monthlyAgents/PmsColumnMapper", "generic")).toContain(
      "a local-service business's exported revenue data file"
    );
    expect(renderPrompt("gbpAgents/ReviewReply", "generic")).toContain(
      "protected customer information"
    );
  });

  it("keeps banned healthcare examples out of generic prompt prose", () => {
    for (const promptPath of ACTIVE_PROMPTS) {
      const rendered = removeVocabularyDirective(renderPrompt(promptPath, "generic"));
      for (const pattern of GENERIC_FORBIDDEN_PATTERNS) {
        expect(rendered, `${promptPath} leaked ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
