export interface RetryOptions {
  /** Total attempts including the first one. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return true if the error is worth retrying. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests (0..1). */
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff with full jitter. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 250,
    maxDelayMs = 4000,
    shouldRetry = () => true,
    sleep = defaultSleep,
    random = Math.random,
  } = opts;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error, attempt)) throw error;
      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(Math.floor(random() * ceiling));
    }
  }
  throw lastError;
}

/** True for network failures and 5xx / 408 HTTP errors. Never for 429 or other 4xx. */
export function isTransientError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === "number") return status >= 500 || status === 408;
  const name = (error as { name?: string } | null)?.name ?? "";
  return /Connection|Timeout|FetchError/i.test(name) || error instanceof TypeError;
}
