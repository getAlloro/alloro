#!/usr/bin/env npx tsx
/**
 * Fireflies-to-Substrate Pipeline CLI
 *
 * Manual trigger per CW Q4 position (cron deferred until manual pattern
 * proves out). Reads transcripts from tmp/fireflies-input/*.json (populated
 * by CC via the Fireflies MCP in the Claude Code session), runs the
 * extraction + aggregation + proposal-write pipeline, and prints the
 * resulting Notion page URL for the human approver.
 *
 * Usage:
 *   npx tsx scripts/run-fireflies-pipeline.ts [flags]
 *
 * Flags:
 *   --window <hours>       Window in hours (1-168). Default 24.
 *   --customer <name>      Filter to a single canonical customer name.
 *                          One of: "One Endodontics", "Artful Orthodontics",
 *                          "Caswell Orthodontics", "Garrison Orthodontics",
 *                          "Coastal Endodontic Studio".
 *   --proposer <CC|CW>     Proposer signature. Default CC.
 *   --dry-run              Skip Notion proposal page write; print proposals only.
 *   --prior-bullets <path> Path to JSON file mapping customer canonical
 *                          name to current Section 2 bullet text. If omitted,
 *                          the pipeline fetches Section 2 from Notion at run time.
 *   --notes <text>         Optional notes attached to the proposal page.
 *   --help                 Show this message.
 *
 * Examples:
 *   # Full-roster 24h run
 *   npx tsx scripts/run-fireflies-pipeline.ts
 *
 *   # Single-customer dry-run
 *   npx tsx scripts/run-fireflies-pipeline.ts \
 *     --customer "Garrison Orthodontics" --dry-run
 *
 *   # 72h backfill against 1Endo (Q3 bonus test)
 *   npx tsx scripts/run-fireflies-pipeline.ts \
 *     --window 72 --customer "One Endodontics" \
 *     --notes "1Endo backfill: contract resolution catch test"
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { runPipeline } from "../src/services/fireflies-pipeline/pipeline";
import { fetchSection2PriorBullets } from "../src/services/fireflies-pipeline/section2Reader";
import type { ProposerSignature } from "../src/services/fireflies-pipeline/constants";

interface CliArgs {
  window: number;
  customer: string | null;
  proposer: ProposerSignature;
  dryRun: boolean;
  priorBulletsPath: string | null;
  notes: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    window: 24,
    customer: null,
    proposer: "CC",
    dryRun: false,
    priorBulletsPath: null,
    notes: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      // eslint-disable-next-line no-fallthrough
      case "--window":
        args.window = Number(argv[++i]);
        break;
      case "--customer":
        args.customer = argv[++i] ?? null;
        break;
      case "--proposer":
        args.proposer = (argv[++i] as ProposerSignature) || "CC";
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--prior-bullets":
        args.priorBulletsPath = argv[++i] ?? null;
        break;
      case "--notes":
        args.notes = argv[++i] ?? "";
        break;
      default:
        console.error(`Unknown flag: ${a}`);
        printHelp();
        process.exit(1);
    }
  }
  return args;
}

function printHelp(): void {
  const helpText = `
Fireflies-to-Substrate Pipeline CLI

Usage:
  npx tsx scripts/run-fireflies-pipeline.ts [flags]

Flags:
  --window <hours>       Window in hours (1-168). Default 24.
  --customer <name>      Filter to a single canonical customer name.
  --proposer <CC|CW>     Proposer signature. Default CC.
  --dry-run              Skip Notion proposal page write.
  --prior-bullets <path> JSON map of customer -> current Section 2 bullet.
  --notes <text>         Optional notes attached to the proposal page.
  --help                 Show this message.
`;
  console.log(helpText.trim());
}

async function loadPriorBulletsFromFile(
  path: string,
): Promise<Map<string, string>> {
  const raw = await readFile(path, "utf-8");
  const obj = JSON.parse(raw) as Record<string, string>;
  return new Map(Object.entries(obj));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  let priorBullets: Map<string, string>;
  if (args.priorBulletsPath) {
    priorBullets = await loadPriorBulletsFromFile(args.priorBulletsPath);
  } else {
    console.error(
      "[CLI] fetching prior Section 2 bullets from Notion (no --prior-bullets flag)",
    );
    priorBullets = await fetchSection2PriorBullets();
  }

  const result = await runPipeline({
    windowHours: args.window,
    onlyCustomer: args.customer,
    proposer: args.proposer,
    priorBullets,
    dryRun: args.dryRun,
    notes: args.notes,
  });

  console.log("");
  console.log("=== Pipeline result ===");
  console.log(`run_id: ${result.run_id}`);
  console.log(`transcripts_considered: ${result.transcripts_considered}`);
  console.log(`transcripts_with_roster_match: ${result.transcripts_with_roster_match}`);
  console.log(`extractions_total: ${result.extractions_total}`);
  console.log(`proposals_generated: ${result.proposals_generated}`);
  if (result.proposal_page) {
    console.log(`proposal_page_id: ${result.proposal_page.page_id}`);
    console.log(`proposal_page_url: ${result.proposal_page.page_url}`);
    console.log("");
    console.log("Hand the page URL to Corey or Jo. They review, edit if");
    console.log("needed, tick Approval, pick Approval signature (Corey or");
    console.log("Jo). Then run scripts/commit-fireflies-proposals.ts to");
    console.log("apply the approved bullets to Section 2.");
  } else if (!args.dryRun) {
    console.log("(no Notion proposal page written; no roster customers in window)");
  } else {
    console.log("(dry run; Notion proposal page write skipped)");
  }

  if (result.proposals.length > 0) {
    console.log("");
    console.log("=== Proposed bullets ===");
    for (const p of result.proposals) {
      console.log(`\n[${p.customer}]`);
      console.log(p.rendered_text);
      console.log(
        `  sources: ${p.source_transcript_ids.join(", ") || "(none)"}`,
      );
    }
  }
}

main().catch((err) => {
  console.error("Pipeline run failed:", err);
  process.exit(1);
});
