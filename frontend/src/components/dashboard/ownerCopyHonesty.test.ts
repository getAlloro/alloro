import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Owner-facing copy honesty sweep (PR #155 review, finding 2).
 *
 * The review's real lesson was not "three files were missed" — it was that the
 * PR CLAIMED the post-to-rank statement was gone from every owner-facing
 * surface while three copies survived. A claim about all of the copy can only
 * be trusted if something checks all of the copy. So this is a sweep, not three
 * spot-fixes.
 *
 * The rule it enforces:
 *
 *   Google Posts convert and reassure. They do NOT move local rank.
 *   (Sterling Sky / lever-evidence-map.)
 *
 * So no owner-facing string may tie posting to a RANK or FOUND outcome. Posts
 * may be described as keeping the profile active, current, or reassuring —
 * that is what they actually do.
 *
 * If this test fails you have added a claim Alloro cannot back with evidence.
 * Reframe the copy to a real post outcome; do not add the file to the
 * allowlist.
 */

const SRC = resolve(__dirname, "../..");

// Where owner-facing copy lives. Admin-only surfaces are internal tooling and
// are swept too — an internal claim becomes an owner claim the moment someone
// copies it into a client email.
const SWEEP_DIRS = ["components", "pages", "utils", "contexts", "hooks"];

const CODE_FILE = /\.(ts|tsx)$/;
const IS_TEST = /\.test\.(ts|tsx)$/;

/**
 * Words that name a RANK / GET-FOUND outcome — the thing posts do not deliver.
 *
 * Deliberately NOT a bare /found/: "No posts found" is an empty state, not a
 * claim. Get-found phrasings are matched explicitly instead.
 */
const RANK_OUTCOME = new RegExp(
  [
    "\\brank(?:ing|s|ed)?\\b",
    "\\bposition\\b",
    "\\btop[- ](?:three|3|20)\\b",
    "\\bmap ?pack\\b",
    "\\blocal (?:search|map)\\b",
    "\\bshow up\\b",
    "\\bget(?:ting)? found\\b",
    "\\bbe found\\b",
    "\\bfound (?:in|on|by)\\b",
    "\\bfindable\\b",
    "\\bvisibility\\b",
    "\\bdiscoverab\\w*\\b",
    // Outcome verbs that imply a rank move when tied to posting.
    "\\bmeasurable lift\\b",
    "\\brank(?:ing)? (?:lift|boost)\\b",
    "\\bclimb\\b",
    "\\boutrank\\b",
  ].join("|"),
  "i",
);

/** Words that name POSTING as the cause. */
const POST_CAUSE =
  /\b(posts?|posting|google update|profile activity|profiles? active)\b/i;

/** Comments are documentation, not owner copy — several explain this very rule. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * Pull the PROSE out of a source file: string literals and JSX text nodes.
 *
 * Extracting prose (rather than scanning raw lines) is what makes this sweep
 * work, for two independent reasons:
 *
 *  - Owner copy wraps across source lines. A line-by-line scan reads "…give
 *    Google new, recent content to surface —" and "which helps your practice
 *    show up in local Map and Search results" as unrelated lines and misses the
 *    claim. That exact string shipped on the client Posts tab and survived the
 *    first review. Each chunk is whitespace-flattened so the sentence is whole.
 *  - Flattening the WHOLE file instead would run unrelated code together and
 *    fire on identifiers (`retryJob`, `searchPosition`, `apiPost`), which is
 *    noise, and noise is how a sweep gets muted.
 */
function extractProse(text: string): string[] {
  const clean = stripComments(text);
  const chunks: string[] = [];

  // String literals: "…", '…', `…`.
  for (const re of [
    /"(?:[^"\\\n]|\\.)*"/g,
    /'(?:[^'\\\n]|\\.)*'/g,
    /`(?:[^`\\]|\\.)*`/g,
  ]) {
    for (const m of clean.matchAll(re)) chunks.push(m[0].slice(1, -1));
  }

  // JSX text nodes: text between tags, with no nested tag or expression.
  for (const m of clean.matchAll(/>([^<>{}]+)</g)) chunks.push(m[1]);

  return chunks.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * A violation is a single SENTENCE of prose that names posting and a rank
 * outcome together. Sentence scope keeps a paragraph that mentions both in
 * unrelated sentences from tripping the sweep.
 */
function findViolations(text: string, file: string): string[] {
  const hits: string[] = [];

  for (const chunk of extractProse(text)) {
    for (const sentence of chunk.split(/(?<=[.!?])\s+/u)) {
      if (POST_CAUSE.test(sentence) && RANK_OUTCOME.test(sentence)) {
        hits.push(`${file} → ${sentence.trim().slice(0, 180)}`);
      }
    }
  }

  return hits;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (CODE_FILE.test(entry) && !IS_TEST.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("owner-facing copy never claims Google Posts improve rank", () => {
  it("sweeps every dashboard/page source file for a post-to-rank claim", () => {
    const violations: string[] = [];

    for (const dir of SWEEP_DIRS) {
      const full = join(SRC, dir);
      try {
        statSync(full);
      } catch {
        continue;
      }
      for (const file of walk(full)) {
        violations.push(
          ...findViolations(readFileSync(file, "utf8"), relative(SRC, file)),
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("catches a planted claim — proves the sweep is not vacuous", () => {
    const planted = `      "Post to Google weekly to climb the local search ranking.",`;
    expect(findViolations(planted, "planted.ts")).toHaveLength(1);
  });

  it("catches a claim WRAPPED ACROSS LINES — the exact miss that shipped", () => {
    // Verbatim shape of the client Posts-tab note that survived the first
    // review because a line-by-line grep never saw the two halves together.
    const wrapped = `
      <p>
        Fresh Google Posts keep your Business Profile active and give Google
        new, recent content to surface — which helps your practice show up in
        local Map and Search results.
      </p>`;
    expect(findViolations(wrapped, "wrapped.tsx")).toHaveLength(1);
  });

  it("catches the 'measurable lift' phrasing of the same claim", () => {
    const lift = `  gbp_activity: "Active profiles (8+ posts/quarter) get a measurable lift.",`;
    expect(findViolations(lift, "lift.ts")).toHaveLength(1);
  });

  it("does not flag an honest post claim (activity/reassurance, not rank)", () => {
    const honest = `      "One useful Google post a week keeps your profile looking cared-for.",`;
    expect(findViolations(honest, "honest.ts")).toEqual([]);
  });

  it("does not flag a rank sentence that says nothing about posting", () => {
    const rankOnly = `      "You are ranked #3 in Local Search for that query.",`;
    expect(findViolations(rankOnly, "rank.ts")).toEqual([]);
  });

  it("does not flag an empty state that merely says 'No posts found'", () => {
    const emptyState = `        <p className="text-xs">No published posts found.</p>`;
    expect(findViolations(emptyState, "empty.tsx")).toEqual([]);
  });

  it("does not flag a comment explaining the rule", () => {
    const comment = `// Posts do not improve rank or local search visibility — see lever-evidence-map.`;
    expect(findViolations(comment, "comment.ts")).toEqual([]);
  });
});
