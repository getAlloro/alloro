#!/usr/bin/env node
/**
 * collect-context.mjs — assemble the Gemini PR-review prompt and the changed-line map.
 *
 * Part of plans/06192026-gemini-pr-review-warn. This is CI tooling: it lives outside
 * src/ and frontend/, so the Code Constitution governs what it helps review, not this
 * file. It still follows the spirit of the contract (handle errors, never swallow).
 *
 * Reads (env):
 *   BASE_SHA  PR base commit (merge target). Falls back to HEAD~1 if absent.
 *   HEAD_SHA  PR head commit. Defaults to HEAD.
 *
 * Writes (CWD):
 *   pr-review-prompt.md     full prompt for the Gemini CLI
 *   pr-review-changed.json  { base, head, files: [{ path, addedLines: number[] }] }
 *   GITHUB_OUTPUT: has_changes=true|false
 *
 * Best-effort: on any hard failure it logs and writes empty artifacts, so the
 * workflow degrades to "post no comments" rather than failing (the review is warn-only).
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, posix } from "node:path";

const BASE = process.env.BASE_SHA || "";
const HEAD = process.env.HEAD_SHA || "HEAD";
const BEFORE = process.env.BEFORE_SHA || "";
const EVENT_ACTION = process.env.EVENT_ACTION || "";
const ZERO_SHA = "0000000000000000000000000000000000000000";

function isAncestor(maybeAncestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", maybeAncestor, descendant], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// On `synchronize`, review ONLY the commits this push added (before..after). Fall back
// to the full PR diff (base..head) on the first run / reopen, or on a force-push/rebase
// where `before` is no longer an ancestor of head.
function resolveRange() {
  if (EVENT_ACTION === "synchronize" && BEFORE && BEFORE !== ZERO_SHA && isAncestor(BEFORE, HEAD)) {
    return { range: `${BEFORE}...${HEAD}`, mode: "incremental (new commits since last review)" };
  }
  if (BASE) return { range: `${BASE}...${HEAD}`, mode: "full PR" };
  return { range: `${HEAD}~1...${HEAD}`, mode: "full (local fallback)" };
}

const { range: RANGE, mode: RANGE_MODE } = resolveRange();

const HEADER_PATH = ".github/gemini/review-prompt.md";
const CONSTITUTION_PATH = "code-constitution.html";
const PROMPT_OUT = "pr-review-prompt.md";
const MAP_OUT = "pr-review-changed.json";

// Caps — keep the prompt bounded; anything dropped is logged (no silent truncation).
const MAX_CHANGED_FILES = 40;
const MAX_RELATED_FILES = 40;
const MAX_FILE_BYTES = 60_000;
const CODE_RE = /\.(ts|tsx)$/;

function log(msg) {
  console.log(`[collect-context] ${msg}`);
}
function warn(msg) {
  console.warn(`[collect-context] ${msg}`);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
}

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  try {
    appendFileSync(file, `${name}=${value}\n`);
  } catch (e) {
    warn(`could not set output ${name}: ${e.message}`);
  }
}

function readFileSafe(path) {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch (e) {
    warn(`could not read ${path}: ${e.message}`);
    return null;
  }
}

function readClamped(path) {
  const buf = readFileSafe(path);
  if (buf === null) return null;
  if (buf.length > MAX_FILE_BYTES) {
    return `${buf.slice(0, MAX_FILE_BYTES)}\n…[truncated ${buf.length - MAX_FILE_BYTES} bytes of ${path}]\n`;
  }
  return buf;
}

function writeEmpty(reason) {
  warn(`writing empty artifacts: ${reason}`);
  writeFileSync(MAP_OUT, JSON.stringify({ base: BASE, head: HEAD, files: [] }, null, 2));
  writeFileSync(PROMPT_OUT, "No reviewable changes.\n");
  setOutput("has_changes", "false");
}

function getChangedFiles() {
  let out = "";
  try {
    out = git(["diff", "--name-status", "--diff-filter=AM", RANGE]);
  } catch (e) {
    warn(`git diff failed for ${RANGE}: ${e.message}`);
    return [];
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter((parts) => parts[1] && CODE_RE.test(parts[1]))
    .map((parts) => parts[1]);
}

function addedLinesFor(path) {
  let diff = "";
  try {
    diff = git(["diff", "--unified=0", RANGE, "--", path]);
  } catch (e) {
    warn(`diff (unified=0) failed for ${path}: ${e.message}`);
    return [];
  }
  const added = [];
  let newLine = 0;
  for (const line of diff.split("\n")) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = parseInt(hunk[1], 10);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added.push(newLine);
      newLine++;
    }
  }
  return added;
}

function patchFor(path) {
  try {
    return git(["diff", "--unified=3", RANGE, "--", path]);
  } catch (e) {
    warn(`diff (unified=3) failed for ${path}: ${e.message}`);
    return "";
  }
}

function trackedFrontendFiles() {
  try {
    return new Set(git(["ls-files", "frontend/src"]).split("\n").filter(Boolean));
  } catch (e) {
    warn(`git ls-files failed: ${e.message}`);
    return new Set();
  }
}

// Backend related files: 1-hop neighbours from the dependency-cruiser graph.
function relatedViaDepcruise(changedSet) {
  const backend = [...changedSet].filter((f) => f.startsWith("src/"));
  if (!backend.length) return [];
  let data;
  try {
    let out;
    try {
      out = execFileSync(
        "npx",
        ["depcruise", "src", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
        { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      );
    } catch (e) {
      // dependency-cruiser exits non-zero when it reports rule violations, but still
      // prints the JSON graph to stdout — use it rather than losing the related files.
      if (e.stdout) out = e.stdout;
      else throw e;
    }
    data = JSON.parse(out);
  } catch (e) {
    warn(`depcruise failed (backend related files skipped): ${e.message}`);
    return [];
  }
  const related = new Set();
  for (const mod of data.modules || []) {
    const src = mod.source;
    if (!src) continue;
    if (changedSet.has(src)) {
      // forward deps: what this changed file imports
      for (const dep of mod.dependencies || []) {
        if (dep.resolved && !changedSet.has(dep.resolved)) related.add(dep.resolved);
      }
    } else {
      // reverse deps: who imports this changed file
      for (const dep of mod.dependencies || []) {
        if (dep.resolved && changedSet.has(dep.resolved)) {
          related.add(src);
          break;
        }
      }
    }
  }
  return [...related].filter((f) => CODE_RE.test(f));
}

function resolveRelativeImport(fromDir, spec, tracked) {
  const base = posix.normalize(`${fromDir}/${spec}`);
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.filter((c) => tracked.has(c));
}

// Frontend related files: depcruise only scans src/, so fall back to same-folder
// siblings plus the relative imports declared in each changed frontend file.
function relatedViaGrep(changedSet, tracked) {
  const fe = [...changedSet].filter((f) => f.startsWith("frontend/src/"));
  if (!fe.length) return [];
  const related = new Set();
  for (const file of fe) {
    const dir = dirname(file);
    for (const t of tracked) {
      if (dirname(t) === dir && t !== file && CODE_RE.test(t) && !changedSet.has(t)) related.add(t);
    }
    const content = readClamped(file);
    if (!content) continue;
    const importRe = /\bfrom\s+['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(content))) {
      for (const r of resolveRelativeImport(dir, m[1], tracked)) {
        if (!changedSet.has(r)) related.add(r);
      }
    }
  }
  return [...related];
}

function constitutionText() {
  const html = readFileSafe(CONSTITUTION_PATH);
  if (!html) {
    warn("constitution html not found; proceeding without it");
    return "";
  }
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&sect;/g, "§")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function main() {
  log(`diff range: ${RANGE} [${RANGE_MODE}]`);
  let changed = getChangedFiles();
  if (!changed.length) {
    writeEmpty("no added/modified .ts/.tsx files in range");
    return;
  }
  if (changed.length > MAX_CHANGED_FILES) {
    warn(`capping changed files ${changed.length} -> ${MAX_CHANGED_FILES} (dropped: ${changed.slice(MAX_CHANGED_FILES).join(", ")})`);
    changed = changed.slice(0, MAX_CHANGED_FILES);
  }
  const changedSet = new Set(changed);

  const fileMap = changed.map((path) => ({ path, addedLines: addedLinesFor(path) }));
  writeFileSync(MAP_OUT, JSON.stringify({ base: BASE, head: HEAD, files: fileMap }, null, 2));
  log(`changed files: ${changed.length}`);

  const tracked = trackedFrontendFiles();
  let related = [...new Set([...relatedViaDepcruise(changedSet), ...relatedViaGrep(changedSet, tracked)])].filter(
    (f) => !changedSet.has(f),
  );
  if (related.length > MAX_RELATED_FILES) {
    warn(`capping related files ${related.length} -> ${MAX_RELATED_FILES}`);
    related = related.slice(0, MAX_RELATED_FILES);
  }
  log(`related files: ${related.length}`);

  const header = readFileSafe(HEADER_PATH) || "Review the changed files below and output a JSON array of findings.";
  const constitution = constitutionText();
  const parts = [header.trim(), ""];
  if (constitution) {
    parts.push("---", "# Alloro Code Constitution", "", constitution, "");
  }
  parts.push("---", "# Changed files (REVIEW THESE)", "");
  for (const path of changed) {
    const content = readClamped(path) ?? "(unable to read file content)";
    parts.push(
      `## CHANGED: ${path}`,
      "",
      "### Diff",
      "```diff",
      patchFor(path).trim(),
      "```",
      "",
      "### Current content",
      "```",
      content.trim(),
      "```",
      "",
    );
  }
  if (related.length) {
    parts.push("---", "# Related files (CONTEXT ONLY — DO NOT COMMENT ON THESE)", "");
    for (const path of related) {
      const content = readClamped(path);
      if (!content) continue;
      parts.push(`## CONTEXT: ${path}`, "", "```", content.trim(), "```", "");
    }
  }

  const prompt = parts.join("\n");
  writeFileSync(PROMPT_OUT, prompt);
  setOutput("has_changes", "true");
  log(`wrote ${PROMPT_OUT} (${prompt.length} bytes) and ${MAP_OUT} (${fileMap.length} files)`);
}

try {
  main();
} catch (e) {
  warn(`unexpected failure: ${e.stack || e.message}`);
  try {
    writeEmpty("unexpected failure");
  } catch {
    // nothing else we can do; stay non-fatal for the warn-only pipeline
  }
}
