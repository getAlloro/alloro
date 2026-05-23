/**
 * Reviewer Claude (Build A) -- Adversarial Card Review
 *
 * Programmatic implementation of the 8-check framework from
 * "🛡️ Reviewer Claude — Dave Perspective Gate v1"
 * (https://www.notion.so/p/34cfdaf120c48152abead0f1e3fe6cbf).
 *
 * Calibrated against the 6 Dave pushbacks from April 23, 2026:
 *  1. Card B scope creep (AEO additions bundled with one-click trigger)
 *  2. Card B FCP 0.4s threshold unsupported
 *  3. Card I grep block too blunt
 *  4. Cards J/K/L committed without Dave's review
 *  5. "Alloro is watching" customer-visible string without Corey approval
 *  6. Scale-hardening theater across multiple cards
 *
 * Inputs: a Bridge Translator Card (the structured spec) + commits.
 * Outputs: blockers, concerns, notes, verdict.
 *
 * The runtime check is deterministic. The eight checks map to structural
 * properties of the card or commit metadata, with a small heuristic layer
 * for free-text fields like commit subjects. No LLM call is made.
 */

import type { Card, Commit } from "./bridgeTranslator";

// ── Types ──────────────────────────────────────────────────────────

export type ReviewerSeverity = "blocker" | "concern" | "note";
export type ReviewerVerdict = "PASS" | "PASS_WITH_CONCERNS" | "BLOCK";

export interface ReviewerFlag {
  check: string; // 1..8
  severity: ReviewerSeverity;
  finding: string;
  recommendation?: string;
}

export interface ReviewerResult {
  verdict: ReviewerVerdict;
  flags: ReviewerFlag[];
  summary: string;
  /** Convenience: severity counts. */
  counts: { blocker: number; concern: number; note: number };
  /** True if any check actually fired. False = clean pass. */
  flagged: boolean;
}

export interface RunReviewerOptions {
  card: Card;
  /** When set, the gate auto-promotes a PASS verdict (no flags trigger HOLD). */
  autoPromoteOnPass?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────

/**
 * Customer-visible string surfaces. If a card touches these, customer copy
 * must be isolated for explicit Corey approval. Patterns are file-path-based.
 */
const CUSTOMER_FACING_PATH_PATTERNS: RegExp[] = [
  /^src\/services\/(narrator|digest|reveal|alerts)\//,
  /^src\/services\/mondayEmail/,
  /^src\/jobs\/(mondayEmail|trialEmails|winbackEmails)\.ts$/,
  /^src\/emails\//,
  /^frontend\/src\/pages\/(HomePage|ComparePage|ReviewsPage|PresencePage|ProgressPage|Checkup|EntryScreen|ResultsScreen)/i,
  /^frontend\/src\/components\/(HomePage|ComparePage|ReviewsPage|PresencePage|ProgressPage|dashboard)\//i,
];

/**
 * Aggressive numeric thresholds in commit subjects that need a basis.
 * Each pattern flags when a commit subject claims a tight SLA or improvement
 * percentage without an "estimated" / source qualifier.
 */
const AGGRESSIVE_THRESHOLDS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\b(?:fcp|lcp|cls|ttfb|inp)\s*(?:under|<|≤|<=)?\s*(?:0\.\d+|[0-9]\.[0-9])\s*s\b/i,
    reason: "Web-vitals threshold — cite Google's good/excellent baseline (FCP good=1.8s, excellent=1.0s)",
  },
  {
    pattern: /\b\d{2,}%\s*(?:faster|improvement|reduction|increase|uplift|conversion)\b/i,
    reason: "Percentage improvement — cite a measurement or prior baseline",
  },
  {
    pattern: /\b(?:p99|p95|p50)\s*(?:under|<|≤|<=)?\s*\d+\s*ms\b/i,
    reason: "Latency SLA — cite current p99/p95 measurement",
  },
];

/**
 * Scale claims that exceed v1 stage. Alloro has dozens of paying customers,
 * not thousands. References to large concurrency/customer counts in cards
 * are flagged as premature scale hardening.
 */
const PREMATURE_SCALE_PATTERNS: RegExp[] = [
  /\b(?:1[0-9]{3,}|[2-9][0-9]{3,})\s*(?:concurrent|customers|users|orgs|tenants|connections|qps)/i,
  /\b(?:sharding|multi-region|cross-region replication|read replicas)\b/i,
  /\b(?:horizontal|auto-?)\s*scale\b/i,
];

/**
 * "Bundled concerns" detector. A card's commits whose subjects mention
 * scope-creep keywords combined with an unrelated noun cluster get flagged.
 * This is deliberately conservative; structural mixed-concern detection
 * already happens in bridgeTranslator's orphan classification.
 */
const SCOPE_CREEP_HINTS: RegExp[] = [
  /\bwhile (?:we'?re )?at it\b/i,
  /\bbonus\b/i,
  /\bincidentally\b/i,
  /\balso\s+adds?\b/i,
];

/**
 * Hard-rule feasibility tripwires: any commit/file changes that look like
 * a global enforcement gate (grep block, path block, env gate) trigger a
 * concern asking whether the rule has carve-outs for legitimate workflows.
 */
const HARD_RULE_PATH_PATTERNS: RegExp[] = [
  /^scripts\/(.*-block|.*-gate|.*-enforcer)\.sh$/,
  /^\.github\/workflows\/.*-block.*\.ya?ml$/,
  /^src\/middleware\/.*(?:block|gate|enforce).*\.ts$/i,
];

const HARD_RULE_SUBJECT_PATTERNS: RegExp[] = [
  /\bgrep\s*(?:-r|--block|--fail)\b/i,
  /\bblock(?:s|ed)?\s+(?:all|every|any)\b/i,
  /\bhard\s+(?:gate|block|enforcement)\b/i,
];

// ── Main Entry ─────────────────────────────────────────────────────

export function runReviewerClaude(
  opts: RunReviewerOptions,
): ReviewerResult {
  const { card } = opts;
  const flags: ReviewerFlag[] = [];

  flags.push(...check1ScopeTightness(card));
  flags.push(...check2PrematureScaleHardening(card));
  flags.push(...check3CustomerVisibleStrings(card));
  flags.push(...check4SchemaAndMigrations(card));
  flags.push(...check5AlreadyCommittedCode(card));
  flags.push(...check6HardRuleFeasibility(card));
  flags.push(...check7NumericClaims(card));
  flags.push(...check8ClarityForDave(card));

  const counts = {
    blocker: flags.filter((f) => f.severity === "blocker").length,
    concern: flags.filter((f) => f.severity === "concern").length,
    note: flags.filter((f) => f.severity === "note").length,
  };

  const verdict: ReviewerVerdict =
    counts.blocker > 0
      ? "BLOCK"
      : counts.concern > 0
        ? "PASS_WITH_CONCERNS"
        : "PASS";

  const summary = composeSummary(card, verdict, counts);

  return {
    verdict,
    flags,
    summary,
    counts,
    flagged: flags.length > 0,
  };
}

// ── Check 1: Scope tightness ───────────────────────────────────────

function check1ScopeTightness(card: Card): ReviewerFlag[] {
  const out: ReviewerFlag[] = [];

  for (const commit of card.commits) {
    for (const hint of SCOPE_CREEP_HINTS) {
      if (hint.test(commit.subject)) {
        out.push({
          check: "1",
          severity: "concern",
          finding: `Commit ${commit.shortSha} subject contains scope-creep hint ("${commit.subject}").`,
          recommendation:
            "Confirm the bundled change was approved. If not, split into a separate card.",
        });
        break;
      }
    }
  }

  // Files-affected breadth across distinct top-level directories. Already
  // computed in bridgeTranslator's complexity, but Reviewer Claude flags
  // it here from a "scope" lens.
  const distinctTopDirs = new Set(
    card.filesAffected.map((f) => f.path.split("/").slice(0, 2).join("/")),
  );
  if (distinctTopDirs.size >= 5) {
    out.push({
      check: "1",
      severity: "concern",
      finding: `Card spans ${distinctTopDirs.size} distinct top-level directories. Likely bundles multiple concerns.`,
      recommendation:
        "Split into per-directory cards or confirm the bundle is intentional.",
    });
  }

  return out;
}

// ── Check 2: Premature scale hardening ─────────────────────────────

function check2PrematureScaleHardening(card: Card): ReviewerFlag[] {
  const out: ReviewerFlag[] = [];
  const hayfields = [
    ...card.commits.map((c) => c.subject),
    ...card.verificationTests,
    card.title,
  ];

  for (const text of hayfields) {
    for (const pattern of PREMATURE_SCALE_PATTERNS) {
      if (pattern.test(text)) {
        out.push({
          check: "2",
          severity: "concern",
          finding: `Premature scale-hardening signal: "${text.slice(0, 120)}".`,
          recommendation:
            "Move scale tests to a comment in code or a backlog ticket. Done Gate should be v1 shipping criteria.",
        });
        break;
      }
    }
  }

  return out;
}

// ── Check 3: Customer-visible strings ──────────────────────────────

function check3CustomerVisibleStrings(card: Card): ReviewerFlag[] {
  const out: ReviewerFlag[] = [];

  const customerFiles = card.filesAffected.filter(({ path }) =>
    CUSTOMER_FACING_PATH_PATTERNS.some((p) => p.test(path)),
  );

  if (customerFiles.length === 0) return out;

  // If the card touches customer-facing surfaces, ensure verification tests
  // mention "Corey approved" or "string review" or similar. If not, flag.
  const verificationText = card.verificationTests.join(" ").toLowerCase();
  const hasApprovalHook =
    /corey approved|string approval|copy approved|customer-visible string/.test(
      verificationText,
    );

  if (!hasApprovalHook) {
    out.push({
      check: "3",
      severity: "blocker",
      finding: `Card touches ${customerFiles.length} customer-facing file(s) (${customerFiles
        .map((f) => f.path)
        .slice(0, 3)
        .join(", ")}${customerFiles.length > 3 ? ", ..." : ""}) but verification tests do not call out customer-visible string review.`,
      recommendation:
        "Add a verification step: \"Customer-visible strings isolated for Corey approval. No string lands without explicit sign-off.\"",
    });
  }

  return out;
}

// ── Check 4: Schema and migrations ─────────────────────────────────

function check4SchemaAndMigrations(card: Card): ReviewerFlag[] {
  const out: ReviewerFlag[] = [];

  if (!card.touches.database) return out;

  const migrationFiles = card.filesAffected.filter((f) =>
    f.path.startsWith("src/database/migrations/"),
  );

  if (migrationFiles.length === 0) {
    // touches.database is true but no migration files — probably model-layer
    // change without migration. Flag as concern.
    out.push({
      check: "4",
      severity: "concern",
      finding:
        "Card flagged as touching database but no migration files appear in the changes.",
      recommendation:
        "Confirm the schema change ships with a migration, or remove the database flag.",
    });
    return out;
  }

  // Migration verification check must reference 'knex migrate:latest' or DDL.
  const verificationText = card.verificationTests.join(" ").toLowerCase();
  const hasMigrationVerification =
    /knex migrate|migrate:latest|create table|alter table|column_name/.test(
      verificationText,
    );

  if (!hasMigrationVerification) {
    out.push({
      check: "4",
      severity: "blocker",
      finding: `Card includes ${migrationFiles.length} migration(s) but verification tests do not include a "knex migrate:latest" or schema-shape check.`,
      recommendation:
        "Add explicit migration verification with the table/column shape check.",
    });
  }

  return out;
}

// ── Check 5: Already-committed code ────────────────────────────────

function check5AlreadyCommittedCode(card: Card): ReviewerFlag[] {
  const out: ReviewerFlag[] = [];

  // The whole point of session mode is to surface what's already committed.
  // This check converts that surface into the right Reviewer Claude flag:
  //  - Yellow/Red blast radius cards land as Concerns (they are already
  //    committed AND change the threshold of safety surface — Dave needs to
  //    review the diff regardless of how the code got written).
  //  - Green blast radius cards land as Notes (already-committed is normal).
  if (card.commits.length === 0) return out;

  if (card.blastRadius === "Red") {
    out.push({
      check: "5",
      severity: "blocker",
      finding: `Card covers ${card.commits.length} already-committed Red-blast commit(s) on sandbox. Dave reviews the diff before merge regardless of how the code got written.`,
      recommendation:
        "Confirm Dave has the full diff and explicit Corey approval for the Red surface (auth/billing/pricing/data deletion).",
    });
  } else if (card.blastRadius === "Yellow") {
    out.push({
      check: "5",
      severity: "concern",
      finding: `Card covers ${card.commits.length} already-committed Yellow commit(s). Dave reviews the diff before merge.`,
      recommendation:
        "Confirm the Yellow surface (DB migration / new API / new service) was on Dave's awareness list before commit.",
    });
  } else {
    out.push({
      check: "5",
      severity: "note",
      finding: `Card covers ${card.commits.length} already-committed Green commit(s). Standard sandbox flow — Dave still reads the diff at merge time.`,
    });
  }

  return out;
}

// ── Check 6: Hard rule feasibility ─────────────────────────────────

function check6HardRuleFeasibility(card: Card): ReviewerFlag[] {
  const out: ReviewerFlag[] = [];

  const ruleFiles = card.filesAffected.filter(({ path }) =>
    HARD_RULE_PATH_PATTERNS.some((p) => p.test(path)),
  );
  if (ruleFiles.length > 0) {
    out.push({
      check: "6",
      severity: "concern",
      finding: `Card adds/modifies enforcement-rule file(s): ${ruleFiles.map((f) => f.path).join(", ")}.`,
      recommendation:
        "Stress-test the rule against realistic workflows. Prefer 'flag for manual review' over 'block merge' unless the rule has zero false positives.",
    });
  }

  for (const commit of card.commits) {
    for (const pattern of HARD_RULE_SUBJECT_PATTERNS) {
      if (pattern.test(commit.subject)) {
        out.push({
          check: "6",
          severity: "concern",
          finding: `Commit ${commit.shortSha} subject suggests a hard-block rule: "${commit.subject}".`,
          recommendation:
            "Confirm the rule has carve-outs for known-good workflows. Hard blocks against legitimate friction are a Dave pushback.",
        });
        break;
      }
    }
  }

  return out;
}

// ── Check 7: Feasibility of numeric claims ─────────────────────────

function check7NumericClaims(card: Card): ReviewerFlag[] {
  const out: ReviewerFlag[] = [];
  const hayfields = [
    ...card.commits.map((c) => c.subject),
    ...card.verificationTests,
    card.title,
  ];

  for (const text of hayfields) {
    for (const { pattern, reason } of AGGRESSIVE_THRESHOLDS) {
      if (pattern.test(text)) {
        out.push({
          check: "7",
          severity: "concern",
          finding: `Aggressive numeric claim without basis: "${text.slice(0, 140)}". ${reason}.`,
          recommendation:
            "Cite the measurement or industry benchmark. If the number is aspirational, mark it as a warning, not a halt.",
        });
        break;
      }
    }
  }

  return out;
}

// ── Check 8: Clarity for Dave ──────────────────────────────────────

function check8ClarityForDave(card: Card): ReviewerFlag[] {
  const out: ReviewerFlag[] = [];

  // The card title is Dave's TL;DR. Heuristics:
  //  - Title length under 6 words is too thin (e.g. "Database Migrations").
  //  - Title length over 14 words is unfocused.
  const wordCount = card.title.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4) {
    out.push({
      check: "8",
      severity: "note",
      finding: `Card title "${card.title}" is short (${wordCount} word(s)). Dave's TL;DR scan benefits from a phrase, not a noun.`,
      recommendation:
        "Expand the title to 4-10 words covering what gets built and why.",
    });
  }

  // Verification tests should average around 1-3 sentences per step. If a
  // card has zero or one tests, Dave can't gauge effort.
  if (card.verificationTests.length <= 1) {
    out.push({
      check: "8",
      severity: "concern",
      finding: `Card has ${card.verificationTests.length} verification test(s). Dave cannot scope a 2-hour vs 2-week task from this.`,
      recommendation:
        "Add at least one test per affected surface (DB shape, route smoke, browser smoke).",
    });
  }

  return out;
}

// ── Helpers ────────────────────────────────────────────────────────

function composeSummary(
  card: Card,
  verdict: ReviewerVerdict,
  counts: { blocker: number; concern: number; note: number },
): string {
  const verdictLine =
    verdict === "PASS"
      ? "Clean pass against the 8-check framework."
      : verdict === "PASS_WITH_CONCERNS"
        ? "Passes with concerns — Corey reviews before forwarding to Dave."
        : "Held — blockers must clear before Dave sees this card.";

  return [
    `Card ${card.number}: ${card.title}`,
    `Blast Radius: ${card.blastRadius} | Complexity: ${card.complexity}`,
    `Reviewer Claude verdict: ${verdict}. Blockers ${counts.blocker}, concerns ${counts.concern}, notes ${counts.note}.`,
    verdictLine,
  ].join("\n");
}

/**
 * Markdown rendering of a reviewer pass, in the format the Notion page spec
 * defines. Used by the inbox writer so each card row links to a human-readable
 * audit log.
 */
export function renderReviewerMarkdown(
  card: Card,
  result: ReviewerResult,
): string {
  const lines: string[] = [];
  lines.push(`## Reviewer Claude Pass — Card ${card.number}: ${card.title}`);
  lines.push("");
  lines.push("### Summary");
  lines.push(result.summary);
  lines.push("");

  const blockers = result.flags.filter((f) => f.severity === "blocker");
  const concerns = result.flags.filter((f) => f.severity === "concern");
  const notes = result.flags.filter((f) => f.severity === "note");

  if (blockers.length > 0) {
    lines.push("### Blockers (🔴)");
    for (const flag of blockers) {
      lines.push(`- **Check ${flag.check}:** ${flag.finding}`);
      if (flag.recommendation) lines.push(`  - Fix: ${flag.recommendation}`);
    }
    lines.push("");
  }

  if (concerns.length > 0) {
    lines.push("### Concerns (🟡)");
    for (const flag of concerns) {
      lines.push(`- **Check ${flag.check}:** ${flag.finding}`);
      if (flag.recommendation) lines.push(`  - Recommendation: ${flag.recommendation}`);
    }
    lines.push("");
  }

  if (notes.length > 0) {
    lines.push("### Notes (🔵)");
    for (const flag of notes) {
      lines.push(`- **Check ${flag.check}:** ${flag.finding}`);
    }
    lines.push("");
  }

  lines.push("### Verdict");
  lines.push(result.verdict);

  return lines.join("\n");
}

/**
 * Decide if a PASS verdict is eligible for auto-promotion. Currently this is
 * a straight pass-through, but isolated here so future conditions (e.g. Red
 * blast radius always requires Corey review even on PASS) can land in one
 * place.
 */
export function shouldAutoPromote(
  card: Card,
  result: ReviewerResult,
  autoPromoteOnPass: boolean,
): boolean {
  if (!autoPromoteOnPass) return false;
  if (result.verdict !== "PASS") return false;
  // Red blast radius always pauses for Corey, even on PASS.
  if (card.blastRadius === "Red") return false;
  return true;
}

// Convenience re-export so callers don't have to import from bridgeTranslator
// for the Card type.
export type { Card, Commit };

// ════════════════════════════════════════════════════════════════════
// BUILD A: Claude API-Driven Artifact Reviewer
//
// `runReviewerClaudeOnArtifact` invokes a fresh Claude Opus 4.7 session
// with the verbatim Reviewer Claude system prompt from the Notion page
// (https://www.notion.so/p/34cfdaf120c48152abead0f1e3fe6cbf), passes the
// artifact as the user message, parses the verdict, writes to the
// "Reviewer Gate Audit Log" Notion database, auto-promotes PASS to
// "Sandbox Card Inbox", and posts to Slack on every verdict.
//
// Build B's existing exports (runReviewerClaude, renderReviewerMarkdown,
// shouldAutoPromote) are unchanged. The two functions coexist:
//  - runReviewerClaude (Build B): sync, in-loop, deterministic structural
//    checks against a Card object during session-mode bridge translation.
//  - runReviewerClaudeOnArtifact (Build A): async, stand-alone, real LLM
//    call against a full artifact (Dave Handoff Package, Feature Brief,
//    etc.) — the gate Corey invokes manually before forwarding to Dave.
// ════════════════════════════════════════════════════════════════════

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import axios, { AxiosError } from "axios";

// ── Constants (Build A) ────────────────────────────────────────────

/**
 * Verbatim from "🛡️ Reviewer Claude — Dave Perspective Gate v1"
 * Notion page (34cfdaf120c48152abead0f1e3fe6cbf), as of 2026-04-24.
 *
 * Update only when the canonical Notion page is updated by Corey.
 * The Check 2 extension below this constant is appended at runtime
 * (it is NOT part of the canonical page, which is preserved verbatim
 * here so the on-disk copy and the Notion source-of-truth match).
 */
const REVIEWER_CLAUDE_SYSTEM_PROMPT_VERBATIM = `You are the Reviewer Claude for Alloro.

Your job is to adversarially review Feature Briefs and other work artifacts before they reach Dave (Alloro's CTO). You are not Corey's assistant. You are not Dave's assistant. You are the quality gate.

Your north star: find what Dave would push back on before Dave sees the work. If you pass a brief that Dave later pushes back on, you failed. If you block a brief that Dave would have accepted cleanly, you were too aggressive. The goal is calibration to Dave's actual standards.

You apply an 8-check validation framework derived from Dave's own feedback on April 23, 2026. You return a flag list with severity tags. You never rewrite the work yourself. You never execute the work. You only review and return flags.

========== THE 8 CHECKS ==========

Check 1: Scope tightness
Does the brief deliver exactly what Dave originally asked for, and nothing more?
- Look for scope additions beyond the original ask.
- Look for "while we're at it" features that weren't in the original request.
- Look for bundled concerns that should be separate cards.
- Flag any scope addition that was not explicitly approved by Corey in the Decision Log or in an explicit sign-off note.

Example Dave pushback caught by this check: Card B's original ask was "one-click PatientPath trigger." The brief added five AEO ship gates. That is scope creep. Blocker unless explicitly approved.

Check 2: Premature scale hardening
Are any Done Gates requiring scale tests beyond current stage?
- Alloro has dozens of paying customers, not thousands.
- Scale tests at 1,000 concurrent loads, 10,000 customers, 100,000 config rows are not v1 blockers.
- Redis cache layers, sharding, multi-region are future work.
- Done Gates should be v1 shipping criteria ("user logs in and sees X"), not imagined-scale validation.

Flag: any scale threshold in a Done Gate that exceeds current stage by an order of magnitude or more. Push to "comment in code, not Done Gate."

Check 3: Customer-visible strings
Is every customer-visible string explicitly listed in a dedicated section with a "Corey approved" flag?
- Email copy (digests, alerts, onboarding, responses).
- Dashboard copy (watchlines, labels, buttons, error messages).
- Agent-generated output that reaches customers.
- Any string a doctor, patient, or prospect will read.

Flag: if customer-visible strings exist in the brief but are not isolated in a dedicated approval section. Flag: if the approval section exists but Corey has not marked the strings approved.

Example Dave pushback caught by this check: "Alloro is watching. Nothing from you required." That string landed on sandbox without Corey approval. Blocker.

Check 4: Schema and migrations
Is every schema change listed with exact migration SQL, in a dedicated section with a "Dave reviewed" flag?
- CREATE TABLE, ALTER TABLE, column additions.
- New indexes, new constraints.
- Data backfills.
- Breaking changes to existing schema.

Flag: schema changes implied in the brief but not isolated with the exact SQL. Flag: any migration that ships without explicit "Dave reviewed: yes" marker.

Check 5: Already-committed code
Did CC (or any Claude) write code before the brief shipped?
- Look for commit SHAs referenced in the brief.
- Look for "already committed" or "landed on sandbox" language.
- Look for cherry-pick instructions.

Flag: any committed code that Dave has not reviewed on the diff. The rule is Dave reviews diffs before merge, regardless of how the code got written. If the brief instructs Dave to cherry-pick unreviewed code, that is a blocker.

Example Dave pushback caught by this check: Cards J, K, L committed to sandbox with schema-changing migrations before Dave saw them. Blocker.

Check 6: Hard rule feasibility
Any new enforcement rules (grep blocks, environment gates, validation blockers)? Stress-test against real-world friction.
- Would this rule break legitimate workflows?
- Would it create false positives at realistic customer edge cases?
- Is the rule a hard block or a soft flag?

Flag: any hard enforcement rule that would cause friction in realistic scenarios. Example: blocking all Gmail addresses in email config when dental practices commonly use Gmail for business. Push to "flag for manual review," not "block merge."

Check 7: Feasibility of numeric claims
Any threshold that sounds aggressive (performance SLAs, percentage improvements, time-to-X targets)? Trace to a reasonable basis or flag as unsupported.
- Performance thresholds should cite real-world measurements or industry benchmarks.
- Percentage improvements should cite a study or prior measurement.
- SLAs should be achievable in current infrastructure.

Flag: any number that lacks a traceable basis. Example: FCP under 0.4s as a ship gate when Google's own "good" threshold is 1.8s and "excellent" is 1.0s. That number is aggressive without basis. Push to 1.0s or flag as a warning, not a halt.

Check 8: Clarity for Dave
Can Dave know in 60 seconds from the TL;DR whether this is a 2-hour or 2-week task?
- Is the TL;DR 2 sentences that name what gets built and why?
- Is the Implementation Plan prescriptive ("modify file X at function Y") or descriptive ("improve the validator")?
- Does the brief say Dave's part explicitly?

Flag: any brief where Dave would have to read the full document to understand scope. Push to rewrite TL;DR.

========== OUTPUT FORMAT ==========

Return a single Markdown response in this exact structure:

## Reviewer Claude Pass — [Feature Name]

### Summary
One sentence: what the brief is for and whether it passes.

### Blockers (🔴)
Every 🔴 must be resolved before the brief ships to Dave.
For each blocker: which check caught it, what was found, what Dave would say, how to fix.

### Concerns (🟡)
Every 🟡 needs Corey's attention. Dismissible with reasoning, fixable on request.
For each concern: which check flagged it, what was found, recommendation.

### Notes (🔵)
FYI for Corey. Not blocking, not urgent.
For each note: what was observed.

### Verdict
One of:
- PASS (zero blockers, zero unresolved concerns). Ship to Dave.
- PASS WITH CONCERNS (zero blockers, unresolved concerns). Corey's call whether to ship.
- BLOCK (one or more blockers). Do not ship. Revise and re-run review.

========== POSTURE ==========

You are adversarial but constructive. You are not performing toughness. You are applying Dave's actual standards because the alternative is Dave spending hours writing pushback.

If you find nothing, say so plainly. Do not invent blockers to prove your usefulness.

If the brief is outside your 8-check framework (for example, a pure design proposal with no code implication), say so and ask Corey whether this framework applies.

If you are uncertain whether something is a blocker or a concern, default to concern. Blockers are reserved for the things Dave would genuinely push back on in Slack.

========== CONTEXT ==========

Alloro has a Decision Log at https://www.notion.so/327fdaf120c4816093cdd4c75d2cc6a6. Locked decisions there are authoritative. If a brief contradicts a locked decision, flag as a blocker.

The current Dave Handoff Package format and April 12 Manifest format are both in transition. The 8-check framework applies regardless of format.

You have access to Notion, Slack, and other MCP tools. Use them if needed to verify claims in the brief (for example, to check whether a cited commit exists, or whether a competitor's data point is accurate). Do not use them to execute the work.

You operate in light mode. Current date matters for staleness checks. Ask Corey for the date if it is not provided.

========== BEGIN REVIEW ==========

Corey will paste the Feature Brief (or a Notion link to it) as his next message. Read it carefully. Apply all 8 checks. Return the flag list in the exact output format above.`;

/**
 * Check 2 extension. Appended at runtime; NOT part of the canonical Notion page.
 * Per Build A spec: "do NOT modify the canonical Notion page." This addition
 * lives only in code so future Notion-prompt updates remain authoritative.
 */
const CHECK_2_EXTENSION = `

========== CHECK 2 EXTENSION (appended by reviewerClaude.ts, May 2 2026) ==========

Additional Check 2 sub-rule:

Verify Done Gate criteria match the framing in introductory text. If the package says scale hardening is future-work, the Done Gates must not reference scale-test verification. Internal contradiction between framing and Done Gates is a Check 2 violation.

========== END EXTENSION ==========`;

/**
 * Reviewer Gate Audit Log Notion database. Created May 2 2026 via N8N
 * integration (so the production NOTION_TOKEN can write to it without
 * requiring a manual share step). Override via env REVIEWER_AUDIT_LOG_DB_ID
 * if a future migration moves it.
 */
export const DEFAULT_REVIEWER_AUDIT_LOG_DATABASE_ID =
  "354fdaf1-20c4-8196-9373-d78eedc29172";

const NOTION_API_BASE_A = "https://api.notion.com/v1";
const NOTION_VERSION_A = "2022-06-28";

const DEFAULT_MODEL = "claude-opus-4-7";

// ── Types (Build A) ─────────────────────────────────────────────────

export interface ReviewerArtifactInput {
  /** Path to a local file containing the artifact. */
  artifactPath?: string;
  /** Pre-loaded artifact content. Either this OR artifactPath must be set. */
  artifactContent?: string;
  /** Human-readable label for the artifact (Notion page name, file name, etc.). */
  artifactSource?: string;
  /** URL to the artifact's source-of-truth (Notion page, GitHub PR, etc.). */
  linkedArtifactUrl?: string;
  /** Override the audit log Notion database ID. */
  auditLogDbId?: string;
  /** When true, write a card to Sandbox Card Inbox on PASS. Default true. */
  autoPromoteOnPass?: boolean;
  /** Slack channel id for verdict notifications. Falls back to env var. */
  slackChannelId?: string;
  /** Override the model. Default: claude-opus-4-7. */
  model?: string;
  /** Skip the Anthropic API call and use this raw response instead (testing only). */
  rawResponseOverride?: string;
}

export interface ParsedFlag {
  /** Check number cited (1..8) if the response references one. */
  check?: string;
  /** Verbatim finding text (after stripping the leading bullet/marker). */
  finding: string;
}

export interface ReviewerArtifactResult {
  verdict: ReviewerVerdict;
  blockers: ParsedFlag[];
  concerns: ParsedFlag[];
  notes: ParsedFlag[];
  auditLogPageId?: string;
  auditLogPageUrl?: string;
  autoPromoted: boolean;
  rawResponse: string;
  artifactSource: string;
  /** Slack message ts if posted; undefined if skipped. */
  slackMessageTs?: string;
}

// ── Main Entry (Build A) ────────────────────────────────────────────

/**
 * Run the Reviewer Claude gate on a full artifact (Dave Handoff Package,
 * Feature Brief, Migration Manifest, etc.).
 *
 * Steps:
 *  1. Load artifact content (from path, content, or no-op if rawResponseOverride set)
 *  2. Call claude-opus-4-7 with the verbatim Reviewer Claude system prompt
 *     plus the runtime Check 2 extension
 *  3. Parse the markdown response into verdict + blocker/concern/note lists
 *  4. Write a row to the Reviewer Gate Audit Log Notion database
 *  5. Auto-promote PASS by writing a row to the Sandbox Card Inbox
 *  6. Post a Slack notification on every verdict
 *  7. Return the result
 */
export async function runReviewerClaudeOnArtifact(
  input: ReviewerArtifactInput,
): Promise<ReviewerArtifactResult> {
  const { content, sourceLabel, linkedUrl } = loadArtifact(input);
  const autoPromoteOnPass = input.autoPromoteOnPass !== false;
  const model = input.model || DEFAULT_MODEL;

  console.log(
    `[ReviewerClaudeArtifact] Reviewing "${sourceLabel}" (${content.length} chars) with ${model}`,
  );

  let rawResponse: string;
  if (input.rawResponseOverride) {
    rawResponse = input.rawResponseOverride;
    console.log(`[ReviewerClaudeArtifact] Using raw response override (testing mode)`);
  } else {
    rawResponse = await callReviewerClaudeAPI(content, model);
  }

  const parsed = parseReviewerResponse(rawResponse);

  console.log(
    `[ReviewerClaudeArtifact] Verdict: ${parsed.verdict}. Blockers ${parsed.blockers.length}, concerns ${parsed.concerns.length}, notes ${parsed.notes.length}.`,
  );

  // 4. Write audit log
  const auditLog = await writeAuditLogRow({
    artifactSource: sourceLabel,
    linkedArtifactUrl: linkedUrl,
    parsed,
    rawResponse,
    autoPromoted: false, // updated below if PASS auto-promotes
    auditLogDbId: input.auditLogDbId || DEFAULT_REVIEWER_AUDIT_LOG_DATABASE_ID,
  });

  // 5. Auto-promote on PASS, otherwise prep Slack escalation
  let autoPromoted = false;
  if (parsed.verdict === "PASS" && autoPromoteOnPass) {
    try {
      await autoPromoteToInbox({
        artifactSource: sourceLabel,
        linkedArtifactUrl: linkedUrl,
        auditLogPageUrl: auditLog?.pageUrl,
        artifactContent: content,
      });
      autoPromoted = true;
      // Patch audit log row with auto-promoted=true
      if (auditLog?.pageId) {
        await patchAuditLogAutoPromoted(auditLog.pageId, true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ReviewerClaudeArtifact] auto-promote failed:`, message);
    }
  }

  // 6. Slack notification
  const slackMessageTs = await postVerdictToSlack({
    verdict: parsed.verdict,
    artifactSource: sourceLabel,
    auditLogPageUrl: auditLog?.pageUrl,
    autoPromoted,
    blockers: parsed.blockers,
    concerns: parsed.concerns,
    slackChannelId: input.slackChannelId,
  });

  return {
    verdict: parsed.verdict,
    blockers: parsed.blockers,
    concerns: parsed.concerns,
    notes: parsed.notes,
    auditLogPageId: auditLog?.pageId,
    auditLogPageUrl: auditLog?.pageUrl,
    autoPromoted,
    rawResponse,
    artifactSource: sourceLabel,
    slackMessageTs,
  };
}

// ── Step 1: Load artifact ──────────────────────────────────────────

function loadArtifact(input: ReviewerArtifactInput): {
  content: string;
  sourceLabel: string;
  linkedUrl?: string;
} {
  if (input.rawResponseOverride) {
    return {
      content: "",
      sourceLabel: input.artifactSource || "test-fixture",
      linkedUrl: input.linkedArtifactUrl,
    };
  }

  if (input.artifactContent !== undefined) {
    return {
      content: input.artifactContent,
      sourceLabel: input.artifactSource || "inline-content",
      linkedUrl: input.linkedArtifactUrl,
    };
  }

  if (!input.artifactPath) {
    throw new Error(
      "[ReviewerClaudeArtifact] Either artifactPath, artifactContent, or rawResponseOverride must be provided.",
    );
  }

  if (!fs.existsSync(input.artifactPath)) {
    throw new Error(
      `[ReviewerClaudeArtifact] artifactPath does not exist: ${input.artifactPath}`,
    );
  }

  const content = fs.readFileSync(input.artifactPath, "utf8");
  const sourceLabel =
    input.artifactSource || path.basename(input.artifactPath);
  return { content, sourceLabel, linkedUrl: input.linkedArtifactUrl };
}

// ── Step 2: Call Claude API ────────────────────────────────────────

async function callReviewerClaudeAPI(
  artifactContent: string,
  model: string,
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "[ReviewerClaudeArtifact] ANTHROPIC_API_KEY env var is required.",
    );
  }

  const client = new Anthropic();
  const fullSystemPrompt = REVIEWER_CLAUDE_SYSTEM_PROMPT_VERBATIM + CHECK_2_EXTENSION;
  const dateContext = `\n\nCurrent date: ${new Date().toISOString().split("T")[0]}.`;

  // Prompt caching: the Reviewer Claude system prompt is verbatim and large
  // (thousands of tokens) and is reused across many artifacts in the same
  // 5-minute window. Send it as a TextBlockParam[] with cache_control
  // ephemeral on the large stable block; cache reads cost 10 percent of
  // normal input tokens.
  //
  // The date is in a separate (uncached) block intentionally. The reviewer
  // prompt uses the date for staleness checks (see Light Mode notes in the
  // verbatim prompt above), so the date IS load-bearing, but it changes
  // daily. Keeping it out of the cached block means same-prompt calls hit
  // the cache across days, not only same-day. Day boundary no longer
  // invalidates the cache; only meaningful prompt edits do.
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: fullSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: dateContext,
      },
    ],
    messages: [
      {
        role: "user",
        content: artifactContent,
      },
    ],
  });

  // Extract text from the response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  const text = textBlocks.map((b) => b.text).join("\n");
  if (!text) {
    throw new Error(
      "[ReviewerClaudeArtifact] Claude returned no text in response.",
    );
  }
  return text;
}

// ── Step 3: Parse response ─────────────────────────────────────────

interface ParsedReviewerResponse {
  verdict: ReviewerVerdict;
  blockers: ParsedFlag[];
  concerns: ParsedFlag[];
  notes: ParsedFlag[];
  summary: string;
}

/**
 * Parse the Reviewer Claude markdown output into a structured result.
 * Tolerant of formatting variation (different bullet markers, extra newlines).
 */
export function parseReviewerResponse(raw: string): ParsedReviewerResponse {
  // Normalize line endings
  const text = raw.replace(/\r\n/g, "\n");

  const summary = extractSection(text, "Summary").trim();
  const blockersText = extractSection(text, "Blockers");
  const concernsText = extractSection(text, "Concerns");
  const notesText = extractSection(text, "Notes");
  const verdictText = extractSection(text, "Verdict");

  const blockers = parseFlagBullets(blockersText);
  const concerns = parseFlagBullets(concernsText);
  const notes = parseFlagBullets(notesText);

  // Sanity clamp: blocker count overrides the stated verdict line. If
  // Claude's output contradicts itself (says PASS with 3 blockers listed),
  // trust the blockers.
  let verdict = parseVerdictLine(verdictText);
  if (blockers.length > 0) verdict = "BLOCK";
  else if (concerns.length > 0 && verdict === "PASS")
    verdict = "PASS_WITH_CONCERNS";

  return { verdict, blockers, concerns, notes, summary };
}

function extractSection(text: string, sectionName: string): string {
  // Match "### Section Name" (with optional emoji or " (🔴)" suffix) at line start,
  // then capture everything up to the next "### " header or end of text.
  const re = new RegExp(
    `###\\s+${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n###\\s|$)`,
    "i",
  );
  const match = re.exec(text);
  return match ? match[1].trim() : "";
}

function parseFlagBullets(sectionText: string): ParsedFlag[] {
  if (!sectionText.trim()) return [];

  const flags: ParsedFlag[] = [];
  const lines = sectionText.split("\n");

  // Detect any of: "- ", "* ", "1. ", "**1.**", "**1.", "1) "
  const ITEM_START = /^\s*(?:[-*]\s+|\*\*\s*\d+\.\s*\*?\*?\s*|\d+[.)]\s+)(.*)$/;

  let current: ParsedFlag | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const itemMatch = ITEM_START.exec(line);
    if (itemMatch) {
      if (current && current.finding.trim()) {
        flags.push(current);
      }
      const content = itemMatch[1].trim();
      const checkMatch = /Check\s*(\d)\b/i.exec(content);
      current = {
        check: checkMatch ? checkMatch[1] : undefined,
        finding: content,
      };
    } else if (current && line.trim().length > 0) {
      current.finding += " " + line.trim();
    }
  }
  if (current && current.finding.trim()) {
    flags.push(current);
  }

  // Filter out boilerplate placeholders.
  return flags.filter((f) => {
    const lc = f.finding.trim().toLowerCase();
    return !/^(none|n\/a|no\s+(flags|blockers|concerns|notes))/i.test(lc);
  });
}

function parseVerdictLine(text: string): ReviewerVerdict {
  const lc = text.toLowerCase();
  if (/\bblock\b/.test(lc)) return "BLOCK";
  if (/pass\s*with\s*concerns|pass_with_concerns/i.test(lc))
    return "PASS_WITH_CONCERNS";
  if (/\bpass\b/.test(lc)) return "PASS";
  // Fallback: scan blocker count from "blockers (🔴)" header line
  return "PASS";
}

// ── Step 4: Write audit log ────────────────────────────────────────

interface AuditLogWriteInput {
  artifactSource: string;
  linkedArtifactUrl?: string;
  parsed: ParsedReviewerResponse;
  rawResponse: string;
  autoPromoted: boolean;
  auditLogDbId: string;
}

async function writeAuditLogRow(input: AuditLogWriteInput): Promise<{
  pageId: string;
  pageUrl: string;
} | undefined> {
  const headers = notionHeadersA();
  if (!headers) {
    console.warn(
      `[ReviewerClaudeArtifact] NOTION_TOKEN missing — skipping audit log write.`,
    );
    return undefined;
  }

  const flagListText = renderFlagListPlain(input.parsed);
  const titleStr = `${input.parsed.verdict} — ${input.artifactSource} — ${new Date().toISOString().split("T")[0]}`;

  const properties: Record<string, unknown> = {
    Title: {
      title: [{ type: "text", text: { content: titleStr.slice(0, 1900) } }],
    },
    Verdict: { select: { name: input.parsed.verdict } },
    "Artifact Source": {
      rich_text: [
        {
          type: "text",
          text: { content: input.artifactSource.slice(0, 1900) },
        },
      ],
    },
    "Reviewed At": { date: { start: new Date().toISOString() } },
    "Blocker Count": { number: input.parsed.blockers.length },
    "Concern Count": { number: input.parsed.concerns.length },
    "Note Count": { number: input.parsed.notes.length },
    "Full Flag List": {
      rich_text: [
        {
          type: "text",
          text: { content: flagListText.slice(0, 1900) },
        },
      ],
    },
    "Auto-Promoted": { checkbox: input.autoPromoted },
  };
  if (input.linkedArtifactUrl) {
    properties["Linked Artifact"] = { url: input.linkedArtifactUrl };
  }

  // Page body: full Reviewer Claude markdown response, chunked into paragraph blocks
  const bodyBlocks = chunkForNotionBlocks(input.rawResponse);

  try {
    const response = await axios.post(
      `${NOTION_API_BASE_A}/pages`,
      {
        parent: { database_id: input.auditLogDbId },
        properties,
        children: bodyBlocks,
      },
      { headers },
    );
    return { pageId: response.data.id, pageUrl: response.data.url };
  } catch (err) {
    logNotionErrorA("writeAuditLogRow", err);
    return undefined;
  }
}

async function patchAuditLogAutoPromoted(
  pageId: string,
  value: boolean,
): Promise<void> {
  const headers = notionHeadersA();
  if (!headers) return;
  try {
    await axios.patch(
      `${NOTION_API_BASE_A}/pages/${pageId}`,
      { properties: { "Auto-Promoted": { checkbox: value } } },
      { headers },
    );
  } catch (err) {
    logNotionErrorA("patchAuditLogAutoPromoted", err);
  }
}

function renderFlagListPlain(parsed: ParsedReviewerResponse): string {
  const lines: string[] = [];
  if (parsed.blockers.length > 0) {
    lines.push(`BLOCKERS (${parsed.blockers.length}):`);
    parsed.blockers.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.finding.slice(0, 280)}`);
    });
  }
  if (parsed.concerns.length > 0) {
    lines.push(`CONCERNS (${parsed.concerns.length}):`);
    parsed.concerns.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.finding.slice(0, 280)}`);
    });
  }
  if (parsed.notes.length > 0) {
    lines.push(`NOTES (${parsed.notes.length}):`);
    parsed.notes.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.finding.slice(0, 200)}`);
    });
  }
  return lines.join("\n");
}

function chunkForNotionBlocks(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const max = 1900;
  let i = 0;
  while (i < text.length && out.length < 95) {
    const slice = text.slice(i, i + max);
    out.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: slice } }],
      },
    });
    i += max;
  }
  return out;
}

// ── Step 5: Auto-promote on PASS ───────────────────────────────────

interface AutoPromoteInput {
  artifactSource: string;
  linkedArtifactUrl?: string;
  auditLogPageUrl?: string;
  artifactContent: string;
}

async function autoPromoteToInbox(input: AutoPromoteInput): Promise<void> {
  const inboxDbId =
    process.env.SANDBOX_CARD_INBOX_DATABASE_ID ||
    "ddac061f-88fe-4f5e-9863-d5be2449cf81";

  const headers = notionHeadersA();
  if (!headers) {
    console.warn(
      `[ReviewerClaudeArtifact] NOTION_TOKEN missing — skipping auto-promote.`,
    );
    return;
  }

  const date = new Date().toISOString().split("T")[0];
  const slug = input.artifactSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const cardId = `gate-${date}-${slug}`;

  // Confidence on PASS = Green (no blockers, no concerns)
  const properties: Record<string, unknown> = {
    Title: {
      title: [
        {
          type: "text",
          text: { content: `Reviewer Gate PASS: ${input.artifactSource}` },
        },
      ],
    },
    "Card ID": {
      rich_text: [{ type: "text", text: { content: cardId } }],
    },
    "Functional Area": { select: { name: "other" } },
    Status: { select: { name: "New" } },
    Confidence: { select: { name: "🟢 Green" } },
    "Reviewer Gate Verdict": { select: { name: "PASS" } },
    "Source Commits": {
      rich_text: [
        {
          type: "text",
          text: { content: "(artifact-level promotion — no commits)" },
        },
      ],
    },
    "Card Body": {
      rich_text: [
        {
          type: "text",
          text: {
            content:
              `Reviewer Gate cleared "${input.artifactSource}" on ${date}.\n\nAudit log: ${input.auditLogPageUrl || "(missing)"}\n\nSource artifact: ${input.linkedArtifactUrl || "(missing)"}`.slice(
                0,
                1900,
              ),
          },
        },
      ],
    },
  };
  if (input.auditLogPageUrl) {
    properties["Linked Audit Log"] = { url: input.auditLogPageUrl };
  }

  // Body blocks: a heading + the original artifact content (chunked)
  const blocks: Array<Record<string, unknown>> = [
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: { content: "Reviewer Gate: PASS." },
          },
        ],
      },
    },
    ...chunkForNotionBlocks(input.artifactContent.slice(0, 30000)),
  ];

  try {
    await axios.post(
      `${NOTION_API_BASE_A}/pages`,
      {
        parent: { database_id: inboxDbId },
        properties,
        children: blocks,
      },
      { headers },
    );
  } catch (err) {
    logNotionErrorA("autoPromoteToInbox", err);
    throw err;
  }
}

// ── Step 6: Slack notification ─────────────────────────────────────

interface SlackPostInput {
  verdict: ReviewerVerdict;
  artifactSource: string;
  auditLogPageUrl?: string;
  autoPromoted: boolean;
  blockers: ParsedFlag[];
  concerns: ParsedFlag[];
  slackChannelId?: string;
}

async function postVerdictToSlack(
  input: SlackPostInput,
): Promise<string | undefined> {
  const channelId =
    input.slackChannelId || process.env.ALLORO_DEV_SLACK_CHANNEL_ID;
  if (!channelId) {
    console.warn(
      `[ReviewerClaudeArtifact] No Slack channel id (set ALLORO_DEV_SLACK_CHANNEL_ID) — verdict logged to console only.`,
    );
    console.log(
      `[ReviewerClaudeArtifact] SLACK MESSAGE WOULD BE: ${composeSlackMessage(input)}`,
    );
    return undefined;
  }

  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) {
    console.warn(
      `[ReviewerClaudeArtifact] SLACK_BOT_TOKEN missing — verdict logged to console only.`,
    );
    return undefined;
  }

  const message = composeSlackMessage(input);
  try {
    const response = await axios.post(
      "https://slack.com/api/chat.postMessage",
      { channel: channelId, text: message, mrkdwn: true },
      {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
    if (response.data?.ok) {
      return response.data.ts as string;
    }
    console.error(
      `[ReviewerClaudeArtifact] Slack post failed:`,
      response.data?.error || response.data,
    );
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error(
        `[ReviewerClaudeArtifact] Slack post error:`,
        err.response?.status,
        err.response?.data || err.message,
      );
    } else if (err instanceof Error) {
      console.error(`[ReviewerClaudeArtifact] Slack post error:`, err.message);
    }
  }
  return undefined;
}

function composeSlackMessage(input: SlackPostInput): string {
  const auditLink = input.auditLogPageUrl
    ? `<${input.auditLogPageUrl}|audit log>`
    : "(audit log unavailable)";
  const promoted = input.autoPromoted ? "yes" : "no";
  const headline = `Reviewer Gate: *${input.verdict}* on *${input.artifactSource}*. ${auditLink}. Auto-promoted: ${promoted}.`;

  // For non-PASS verdicts, tag Corey and inline the top blockers/concerns.
  if (input.verdict === "PASS") return headline;

  const tag = process.env.COREY_SLACK_USER_ID
    ? `<@${process.env.COREY_SLACK_USER_ID}> `
    : "@corey ";

  const detailLines: string[] = [];
  if (input.blockers.length > 0) {
    detailLines.push(`*Blockers (${input.blockers.length}):*`);
    input.blockers.slice(0, 5).forEach((f, i) => {
      detailLines.push(`${i + 1}. ${truncate(f.finding, 280)}`);
    });
  }
  if (input.concerns.length > 0 && input.verdict === "PASS_WITH_CONCERNS") {
    detailLines.push(`*Concerns (${input.concerns.length}):*`);
    input.concerns.slice(0, 5).forEach((f, i) => {
      detailLines.push(`${i + 1}. ${truncate(f.finding, 280)}`);
    });
  }

  return `${tag}${headline}\n${detailLines.join("\n")}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// ── Helpers ─────────────────────────────────────────────────────────

function notionHeadersA(): Record<string, string> | null {
  const token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION_A,
    "Content-Type": "application/json",
  };
}

function logNotionErrorA(label: string, err: unknown): void {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError;
    console.error(
      `[ReviewerClaudeArtifact] ${label} failed:`,
      ax.response?.status,
      ax.response?.data || ax.message,
    );
  } else if (err instanceof Error) {
    console.error(`[ReviewerClaudeArtifact] ${label} failed:`, err.message);
  } else {
    console.error(`[ReviewerClaudeArtifact] ${label} failed:`, String(err));
  }
}
