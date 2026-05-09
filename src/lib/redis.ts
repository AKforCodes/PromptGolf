import { Redis } from "@upstash/redis"
import { getRequiredEnv } from "./env"

export const redis = new Redis({
  url: getRequiredEnv("UPSTASH_REDIS_REST_URL"),
  token: getRequiredEnv("UPSTASH_REDIS_REST_TOKEN"),
})
