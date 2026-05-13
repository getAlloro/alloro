export type RetryDecision = "retry" | "fail_fast";

export interface RetryAttemptRecord {
  attempt: number;
  outcome: "failed" | "success";
  decision?: RetryDecision;
  reason?: string;
  message?: string;
}

export interface RetryResult<T> {
  value: T;
  attempts: RetryAttemptRecord[];
}

export interface RetryOptions {
  label: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  logger?: (message: string) => void;
  shouldRetry?: (error: any) => boolean;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getExternalErrorStatus(error: any): number | null {
  const status = error?.response?.status ?? error?.status ?? error?.code;
  const numericStatus = Number(status);
  return Number.isFinite(numericStatus) ? numericStatus : null;
}

export function getExternalErrorMessage(error: any): string {
  if (error instanceof Error) return error.message;
  if (typeof error?.message === "string") return error.message;
  return String(error);
}

export function isRetryableExternalError(error: any): boolean {
  const status = getExternalErrorStatus(error);
  const code = String(error?.code ?? "").toUpperCase();
  const message = getExternalErrorMessage(error).toLowerCase();

  if (
    message.includes("not set") ||
    message.includes("not configured") ||
    message.includes("not found") ||
    message.includes("no refresh token") ||
    message.includes("invalid_grant") ||
    message.includes("insufficient authentication scopes")
  ) {
    return false;
  }

  if (status !== null) {
    if (status === 408 || status === 409 || status === 425 || status === 429) {
      return true;
    }
    if (status >= 500) return true;
    if (status >= 400) return false;
  }

  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    code === "EAI_AGAIN" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("temporarily unavailable") ||
    message.includes("rate limit") ||
    message.includes("overloaded")
  );
}

export function summarizeRetryAttempts(
  attempts: RetryAttemptRecord[],
): string {
  if (attempts.length === 0) return "attempts=0";
  const failed = attempts.filter((attempt) => attempt.outcome === "failed");
  const success = attempts.some((attempt) => attempt.outcome === "success");
  return `attempts=${attempts.length};failed=${failed.length};success=${success}`;
}

export async function runWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<RetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const shouldRetry = options.shouldRetry ?? isRetryableExternalError;
  const attempts: RetryAttemptRecord[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await operation();
      attempts.push({ attempt, outcome: "success" });
      return { value, attempts };
    } catch (error: any) {
      const message = getExternalErrorMessage(error);
      const canRetry = attempt < maxAttempts && shouldRetry(error);
      attempts.push({
        attempt,
        outcome: "failed",
        decision: canRetry ? "retry" : "fail_fast",
        message,
      });

      options.logger?.(
        `[RETRY] ${options.label} attempt ${attempt}/${maxAttempts} failed: ${message}`,
      );

      if (!canRetry) {
        if (error && typeof error === "object") {
          error.retryAttempts = attempts;
        }
        throw error;
      }

      await sleep(baseDelayMs * attempt);
    }
  }

  throw new Error(`${options.label} exhausted ${maxAttempts} attempts`);
}
