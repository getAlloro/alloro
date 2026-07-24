/**
 * preview-owner-receipt — READ-ONLY dev CLI to print an org's honest Owner
 * Receipt from already-stored data, so a human can SEE the real numbers.
 *
 * It writes NOTHING. It is not, however, purely local: the composed read path
 * calls OwnerReceiptService, whose `readVisits` issues two GET requests to the
 * Rybbit analytics API (one per window) using the project's stored integration.
 * Everything else is read from our own database through existing models
 * (§7.4 — no db() of its own, no inline SQL), and printed via the pure text
 * report in formatOwnerReceiptReport.ts.
 *
 * HONESTY (Value #6): the formatter prints "not measured" (never 0) for absent
 * values, shows the impressions delta only when coverage is sufficient, shows
 * the diagnosis only when honestly decomposable, and asserts NO causation. This
 * CLI adds no claims of its own — it prints what the read-model returns.
 *
 * TARGET SAFETY (§5.6): it refuses to run unless DB_HOST is a local database.
 * That is a guard, not a comment — see scripts/previewDatabaseTarget.ts. The
 * resolved target is printed above every report, so a wrong run is visible in
 * its own output and not merely preventable. Override deliberately with
 * ALLOW_NON_LOCAL_DB=1.
 *
 * Usage:
 *   npm run preview:owner-receipt -- --org 39
 *   npm run preview:owner-receipt -- --org 39 \
 *     --pre-start 2026-06-01 --pre-end 2026-06-28 \
 *     --post-start 2026-06-29 --post-end 2026-07-26
 *
 * Default windows: post = the 28 days ending YESTERDAY, pre = the 28 days
 * before that. Yesterday, not today: GSC rows for the current day do not exist
 * yet, so a today-anchored window is never fully covered and the tool's most
 * likely first run would report a false coverage gap on a healthy org.
 */
import dotenv from "dotenv";
dotenv.config();

import { OwnerReceiptService } from "../src/controllers/owner-receipt/feature-services/OwnerReceiptService";
import { OrganizationModel } from "../src/models/OrganizationModel";
import { LocationModel } from "../src/models/LocationModel";
import type { ReceiptWindow } from "../src/controllers/owner-receipt/OwnerReceiptTypes";
import { formatOwnerReceiptReport } from "../src/controllers/owner-receipt/feature-utils/formatOwnerReceiptReport";
import {
  checkDatabaseTarget,
  describeDatabaseTarget,
} from "../src/config/previewDatabaseTarget";

const WINDOW_DAYS = 28;

/**
 * Page size for the dated-actions list. Large on purpose: this is a preview of
 * one org over one window, and a truncated list would make the printed report
 * look emptier than the data is.
 */
const PREVIEW_ACTIONS_LIMIT = 500;

/** Parse `--flag value` pairs from argv into a plain record. */
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith("--")) {
        args[key] = value;
        i++;
      } else {
        args[key] = "";
      }
    }
  }
  return args;
}

/** `YYYY-MM-DD` for a Date in UTC. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Shift a `YYYY-MM-DD` day by whole days (UTC), returning `YYYY-MM-DD`. */
function shiftDay(day: string, deltaDays: number): string {
  const ms = Date.parse(`${day}T00:00:00.000Z`) + deltaDays * 86_400_000;
  return isoDay(new Date(ms));
}

/** True for a well-formed `YYYY-MM-DD` calendar day. */
function isValidDay(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Resolve the pre and post windows from args, or the defaults. Defaults, from
 * today (a clock read is fine in a CLI): post = the last 28 days ending today,
 * pre = the 28 days immediately before that.
 */
function resolveWindows(args: Record<string, string>): { pre: ReceiptWindow; post: ReceiptWindow } {
  const anyWindowFlag =
    args["pre-start"] || args["pre-end"] || args["post-start"] || args["post-end"];

  if (anyWindowFlag) {
    const preStart = args["pre-start"];
    const preEnd = args["pre-end"];
    const postStart = args["post-start"];
    const postEnd = args["post-end"];
    for (const [name, value] of [
      ["--pre-start", preStart],
      ["--pre-end", preEnd],
      ["--post-start", postStart],
      ["--post-end", postEnd],
    ] as const) {
      if (!isValidDay(value)) {
        throw new Error(
          `When any window flag is given, all four must be valid YYYY-MM-DD dates. Bad or missing: ${name}`
        );
      }
    }
    return {
      pre: { start: preStart, end: preEnd },
      post: { start: postStart, end: postEnd },
    };
  }

  // Yesterday, not today: today's GSC row does not exist yet.
  const postEnd = shiftDay(isoDay(new Date()), -1);
  const postStart = shiftDay(postEnd, -(WINDOW_DAYS - 1));
  const preEnd = shiftDay(postStart, -1);
  const preStart = shiftDay(preEnd, -(WINDOW_DAYS - 1));
  return {
    pre: { start: preStart, end: preEnd },
    post: { start: postStart, end: postEnd },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // §5.6 — fail fast, before anything opens a connection or reads a row.
  const target = checkDatabaseTarget(process.env);
  if (!target.allowed) {
    console.error(`[preview-owner-receipt] ${target.reason}`);
    process.exitCode = 1;
    return;
  }

  const orgId = parseInt(args["org"] ?? "", 10);

  if (Number.isNaN(orgId)) {
    console.error(
      "Usage: npm run preview:owner-receipt -- --org <id> " +
        "[--pre-start YYYY-MM-DD --pre-end YYYY-MM-DD --post-start YYYY-MM-DD --post-end YYYY-MM-DD]"
    );
    process.exitCode = 1;
    return;
  }

  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    console.error(`Organization ${orgId} not found.`);
    process.exitCode = 1;
    return;
  }

  const { pre, post } = resolveWindows(args);

  // §7.4 — scope comes through the model, not a raw query. Every location the
  // org owns is "accessible" for this dev preview; the service scopes to them.
  const locations = await LocationModel.findByOrganizationId(orgId);
  const accessibleLocationIds = locations.map((location) => location.id);

  const receipt = await OwnerReceiptService.getReceipt({
    organizationId: orgId,
    accessibleLocationIds,
    preWindow: pre,
    postWindow: post,
    page: 1,
    // The summary total is computed over the whole range regardless of page.
    limit: PREVIEW_ACTIONS_LIMIT,
  });

  // Printed by the CLI, not the formatter: the formatter is pure (no clock, no
  // environment) and its tests assert that.
  process.stdout.write(`${describeDatabaseTarget(target)}\n`);
  process.stdout.write(formatOwnerReceiptReport(receipt));
}

// Only run when invoked directly (not when imported by a test).
if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
      console.error("[preview-owner-receipt] failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
