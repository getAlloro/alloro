#!/usr/bin/env node
/**
 * post-review.mjs — turn Gemini's findings into inline PR comments (warn-only).
 *
 * Part of plans/06192026-gemini-pr-review-warn (CI tooling, outside src/ & frontend/).
 * Reads the model output from GEMINI_SUMMARY (or pr-review-findings.json if present),
 * validates each finding against pr-review-changed.json (file changed + line added),
 * and posts ONE PR review with event=COMMENT so it never blocks the merge.
 *
 * env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo), PR_NUMBER, HEAD_SHA, GEMINI_SUMMARY
 * Best-effort: any failure logs and exits 0.
 */

import { readFileSync, existsSync } from "node:fs";

const API = "https://api.github.com";
const MAX_COMMENTS = 12;
const MAP_PATH = "pr-review-changed.json";
const FINDINGS_FILE = "pr-review-findings.json";

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA } = process.env;

function log(m) {
  console.log(`[post-review] ${m}`);
}
function warn(m) {
  console.warn(`[post-review] ${m}`);
}
function done(msg) {
  log(msg);
  process.exit(0);
}

function loadMap() {
  try {
    return JSON.parse(readFileSync(MAP_PATH, "utf8"));
  } catch (e) {
    warn(`could not read ${MAP_PATH}: ${e.message}`);
    return { files: [] };
  }
}

function rawModelOutput() {
  if (existsSync(FINDINGS_FILE)) {
    try {
      return readFileSync(FINDINGS_FILE, "utf8");
    } catch (e) {
      warn(`could not read ${FINDINGS_FILE}: ${e.message}`);
    }
  }
  return process.env.GEMINI_SUMMARY || "";
}

function parseFindings(raw) {
  if (!raw || !raw.trim()) return [];
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    warn("no JSON array found in model output");
    return [];
  }
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    warn(`could not parse findings JSON: ${e.message}`);
    return [];
  }
}

function validate(findings, map) {
  const allowed = new Map((map.files || []).map((f) => [f.path, new Set(f.addedLines || [])]));
  const valid = [];
  let dropped = 0;
  for (const f of findings) {
    const line = Number(f && f.line);
    if (!f || typeof f.file !== "string" || !Number.isInteger(line)) {
      dropped++;
      continue;
    }
    const lines = allowed.get(f.file);
    if (!lines || !lines.has(line)) {
      dropped++;
      continue;
    }
    valid.push({ ...f, line });
  }
  if (dropped) warn(`dropped ${dropped} finding(s) outside the changed lines`);
  return valid.slice(0, MAX_COMMENTS);
}

function commentBody(f) {
  const article = f.article && f.article !== "null" ? ` (${f.article})` : "";
  const title = f.title ? `**${f.title}**${article}\n\n` : "";
  return `🤖 _Gemini review · advisory_\n\n${title}${f.recommendation || ""}`;
}

async function gh(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function postBatch(owner, repo, comments) {
  return gh(`/repos/${owner}/${repo}/pulls/${PR_NUMBER}/reviews`, "POST", {
    commit_id: HEAD_SHA,
    event: "COMMENT",
    body: `🤖 **Gemini PR review** — advisory, warn-only. ${comments.length} recommendation(s) on changed lines. This check never blocks the merge.`,
    comments: comments.map((c) => ({ path: c.path, line: c.line, side: "RIGHT", body: c.body })),
  });
}

async function postIndividually(owner, repo, comments) {
  let posted = 0;
  for (const c of comments) {
    const r = await gh(`/repos/${owner}/${repo}/pulls/${PR_NUMBER}/comments`, "POST", {
      body: c.body,
      commit_id: HEAD_SHA,
      path: c.path,
      line: c.line,
      side: "RIGHT",
    });
    if (r.ok) posted++;
    else warn(`comment on ${c.path}:${c.line} failed (${r.status}): ${r.text.slice(0, 200)}`);
  }
  return posted;
}

async function main() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER) {
    done("missing GITHUB_TOKEN / GITHUB_REPOSITORY / PR_NUMBER — nothing to post");
  }
  const [owner, repo] = GITHUB_REPOSITORY.split("/");
  const map = loadMap();
  const findings = parseFindings(rawModelOutput());
  log(`parsed ${findings.length} finding(s) from model output`);
  const valid = validate(findings, map);
  if (!valid.length) done("no valid findings on changed lines — posting nothing");

  const comments = valid.map((f) => ({ path: f.file, line: f.line, body: commentBody(f) }));
  if (process.env.DRY_RUN) {
    log(`DRY_RUN: would post ${comments.length} inline comment(s):`);
    for (const c of comments) log(`  ${c.path}:${c.line}`);
    done("dry run — nothing posted");
  }
  const batch = await postBatch(owner, repo, comments);
  if (batch.ok) done(`posted review with ${comments.length} inline comment(s)`);

  warn(`batch review failed (${batch.status}): ${batch.text.slice(0, 300)} — retrying individually`);
  const posted = await postIndividually(owner, repo, comments);
  done(`posted ${posted}/${comments.length} inline comment(s) individually`);
}

main().catch((e) => {
  warn(`unexpected failure: ${e.stack || e.message}`);
  process.exit(0);
});
