/**
 * Settle the website-analysis branch (Branch B) without letting its failure
 * abort the audit.
 *
 * The website analysis is independent of the GBP analysis — the latter consumes
 * only the self-GBP + competitor data from Branch C. Historically the processor
 * awaited Branch B on the critical path before the GBP analysis, so a slow or
 * unparseable website analysis threw and failed the whole job, skipping the GBP
 * analysis entirely. This helper awaits the branch, and on failure logs and runs
 * an `onFailure` degrade (null the website card) so the pipeline continues.
 */

interface NonFatalSettlementHandlers {
  /** Degrade step run when the branch rejects (e.g. null the website card). Return value is ignored. */
  onFailure: () => Promise<unknown>;
  /** Structured error logger (Pino) from the calling scope. */
  logError: (message: string) => void;
}

export async function settleWebsiteBranchNonFatal(
  branch: Promise<void> | null,
  handlers: NonFatalSettlementHandlers
): Promise<void> {
  if (!branch) return;
  try {
    await branch;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    handlers.logError(
      `⚠ WebsiteAnalysis failed (non-fatal) — continuing to GBP analysis: ${message}`
    );
    await handlers.onFailure();
  }
}
