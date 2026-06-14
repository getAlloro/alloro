/**
 * Identity Warmup — bounded async concurrency limiter.
 *
 * Pure helper shared by the warmup orchestrator (auto-discovery sub-page
 * scrape) and the multi-location service (parallel GBP scrapes). No LLM, no DB.
 *
 * Extracted from service.identity-warmup.ts during a behavior-preserving
 * decomposition — logic is identical to the original.
 */

/**
 * Simple concurrency limiter. Runs `worker` over `items` with at most
 * `limit` promises in flight at any time. Preserves error-swallowing
 * responsibility to the worker — this helper never throws.
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, queue.length); i++) {
    runners.push(
      (async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next === undefined) return;
          await worker(next);
        }
      })(),
    );
  }
  await Promise.all(runners);
}
