#!/usr/bin/env npx tsx
/**
 * Fireflies Proposals Committer CLI
 *
 * Reads all Fireflies Proposals database pages where Approval=true,
 * Approval signature in {Corey, Jo}, and Committed=false. For each, reads
 * the page-body bullets (which may have been edited by the approver),
 * runs voice-doctrine check (BLOCK on violation), replaces the Section 2
 * customer block via substrateWriter, appends to Section 2 Event Log,
 * marks the proposal page Committed=true, and archives it.
 *
 * Strict approval-gate enforcement per CW Q2: only Corey or Jo signatures
 * are honored. CC and CW cannot sign.
 *
 * Usage:
 *   npx tsx scripts/commit-fireflies-proposals.ts
 *
 * No flags. Operates on all eligible pages.
 */

import "dotenv/config";
import { commitPendingApprovals } from "../src/services/fireflies-pipeline/committer";

async function main(): Promise<void> {
  console.error("[CLI] commit-fireflies-proposals starting");
  const results = await commitPendingApprovals();

  if (results.length === 0) {
    console.log("No pending approvals found. (Nothing with Approval=true, signature in {Corey, Jo}, Committed=false.)");
    return;
  }

  console.log(`Processed ${results.length} proposal page(s).`);
  console.log("");

  let totalCommitted = 0;
  let totalSkipped = 0;
  let totalEventLog = 0;

  for (const r of results) {
    console.log(`=== Proposal page ${r.page_id} ===`);
    console.log(`  run_id: ${r.run_id}`);
    console.log(`  approver: ${r.approver}`);
    if (r.voice_check_failure) {
      console.log(`  VOICE_CHECK_FAILED for customer ${r.voice_check_failure.customer}`);
      for (const v of r.voice_check_failure.violations) {
        console.log(`    - ${v}`);
      }
      console.log(`  COMMIT ABORTED. Approver must re-edit bullet text.`);
    } else {
      console.log(`  committed_customers: ${r.committed_customers.join(", ") || "(none)"}`);
      if (r.skipped_customers.length > 0) {
        console.log(`  skipped_customers:`);
        for (const s of r.skipped_customers) {
          console.log(`    - ${s.customer}: ${s.reason}`);
        }
      }
      console.log(`  event_log_entries: ${r.event_log_entries}`);
    }
    console.log("");

    totalCommitted += r.committed_customers.length;
    totalSkipped += r.skipped_customers.length;
    totalEventLog += r.event_log_entries;
  }

  console.log(`Summary: ${totalCommitted} bullet(s) committed, ${totalSkipped} skipped, ${totalEventLog} event log row(s) appended.`);
}

main().catch((err) => {
  console.error("Committer run failed:", err);
  process.exit(1);
});
