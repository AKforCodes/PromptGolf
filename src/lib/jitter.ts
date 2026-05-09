/**
 * Sleep a random amount of time within [minMs, maxMs].
 * Used to spread concurrent outbound requests so simultaneous submissions
 * don't all hit a provider's rate-limit window at the same instant.
 */
export async function jitter(minMs = 100, maxMs = 500): Promise<void> {
  const min = Math.max(0, Math.floor(minMs))
  const max = Math.max(min, Math.floor(maxMs))
  const delay = Math.floor(Math.random() * (max - min + 1)) + min
  await new Promise((resolve) => setTimeout(resolve, delay))
}

/**
 * Run `fn` with retry-on-failure using exponential backoff + jitter.
 * Default: 3 attempts, base 500ms, cap 4s.
 *
 * Each backoff = base * 2^attempt + random(0..base).
 *
 * If `shouldRetry` returns false for the thrown error, the error is rethrown
 * immediately without retrying (e.g. 4xx client errors that aren't 429).
 */
export async function withJitterRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    baseMs?: number
    capMs?: number
    shouldRetry?: (err: unknown) => boolean
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3
  const base = options.baseMs ?? 500
  const cap = options.capMs ?? 4000
  const shouldRetry = options.shouldRetry ?? (() => true)

  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === maxAttempts - 1) break
      if (!shouldRetry(err)) throw err

      const exponential = Math.min(cap, base * 2 ** attempt)
      const jitterMs = Math.floor(Math.random() * base)
      await new Promise((resolve) => setTimeout(resolve, exponential + jitterMs))
    }
  }
  throw lastError
}

/**
 * Heuristic check for rate-limit-style errors. Replicate's SDK throws
 * `ApiError` with `response.status === 429`; fal-ai throws errors with
 * `status` or `code` fields. We try a few common shapes.
 */
export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as Record<string, unknown>
  if (e.status === 429) return true
  if ((e.response as Record<string, unknown> | undefined)?.status === 429) return true
  if (typeof e.message === "string" && /429|rate.?limit/i.test(e.message)) return true
  return false
}
