/**
 * Centralized env access. Literal `process.env.X` references inside the ENV
 * record so Next.js can inline NEXT_PUBLIC_* values into the client bundle.
 * Server-only vars resolve to `undefined` in client bundles (Next.js does not
 * expose them), so calling `getRequiredEnv("PUSHER_SECRET")` from the browser
 * will throw — which is the correct behaviour.
 */
const ENV: Record<string, string | undefined> = {
  // Public (browser-safe, inlined at build)
  NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
  NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,

  // Server-only
  PUSHER_APP_ID: process.env.PUSHER_APP_ID,
  PUSHER_SECRET: process.env.PUSHER_SECRET,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  FAL_KEY: process.env.FAL_KEY,
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
  NODE_ENV: process.env.NODE_ENV,
};

function read(key: string): string | undefined {
  const v = ENV[key];
  if (v === undefined || v === "") return undefined;
  return v;
}

export function getEnv(key: string, fallback: string): string;
export function getEnv(key: string, fallback?: undefined): string | undefined;
export function getEnv(key: string, fallback?: string): string | undefined {
  return read(key) ?? fallback;
}

export function getRequiredEnv(key: string): string {
  const v = read(key);
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v;
}
