import { resolveOrgType } from "../constants/orgLabels";

type GeneratedCopyReplacement = {
  pattern: RegExp;
  replacement: string;
};

const GENERIC_COPY_REPLACEMENTS: GeneratedCopyReplacement[] = [
  { pattern: /\bpractice management data\b/gi, replacement: "revenue data" },
  { pattern: /\bPMS data\b/gi, replacement: "revenue data" },
  { pattern: /\bPMS\b/g, replacement: "revenue data" },
  { pattern: /\bdoctor referral sources\b/gi, replacement: "partner sources" },
  { pattern: /\bdoctor referral source\b/gi, replacement: "partner source" },
  {
    pattern: /\bdoctor referrals\b/gi,
    replacement: "partner-sourced records",
  },
  {
    pattern: /\bdoctor referral\b/gi,
    replacement: "partner-sourced record",
  },
  { pattern: /\bself referrals\b/gi, replacement: "direct records" },
  { pattern: /\bself referral\b/gi, replacement: "direct record" },
  { pattern: /\bpatient referrals\b/gi, replacement: "customer records" },
  { pattern: /\bpatient referral\b/gi, replacement: "customer record" },
  { pattern: /\breferral sources\b/gi, replacement: "sources / channels" },
  { pattern: /\breferral source\b/gi, replacement: "source / channel" },
  { pattern: /\breferrals\b/gi, replacement: "records" },
  { pattern: /\breferral\b/gi, replacement: "record" },
  { pattern: /\bpatients\b/gi, replacement: "customers" },
  { pattern: /\bpatient\b/gi, replacement: "customer" },
  { pattern: /\bproduction\b/gi, replacement: "revenue" },
  { pattern: /\bdoctors\b/gi, replacement: "partners" },
  { pattern: /\bdoctor\b/gi, replacement: "partner" },
  { pattern: /\bappointments\b/gi, replacement: "visits" },
  { pattern: /\bappointment\b/gi, replacement: "visit" },
  { pattern: /\bpractices\b/gi, replacement: "businesses" },
  { pattern: /\bpractice\b/gi, replacement: "business" },
];

function sentenceCase(replacement: string): string {
  return replacement.charAt(0).toUpperCase() + replacement.slice(1);
}

function matchCase(match: string, replacement: string): string {
  return /^[A-Z]/.test(match) ? sentenceCase(replacement) : replacement;
}

export function formatGeneratedCopyForOrg(
  text: string,
  orgTypeValue: string | null | undefined,
): string;
export function formatGeneratedCopyForOrg(
  text: null,
  orgTypeValue: string | null | undefined,
): null;
export function formatGeneratedCopyForOrg(
  text: undefined,
  orgTypeValue: string | null | undefined,
): undefined;
export function formatGeneratedCopyForOrg(
  text: string | null,
  orgTypeValue: string | null | undefined,
): string | null;
export function formatGeneratedCopyForOrg(
  text: string | undefined,
  orgTypeValue: string | null | undefined,
): string | undefined;
export function formatGeneratedCopyForOrg(
  text: string | null | undefined,
  orgTypeValue: string | null | undefined,
): string | null | undefined {
  if (typeof text !== "string" || resolveOrgType(orgTypeValue) !== "generic") {
    return text;
  }

  return GENERIC_COPY_REPLACEMENTS.reduce<string>(
    (current, { pattern, replacement }) =>
      current.replace(pattern, (match) => matchCase(match, replacement)),
    text,
  );
}
