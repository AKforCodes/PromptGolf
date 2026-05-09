import PusherServer from "pusher"
import { getRequiredEnv } from "./env"

export const pusher = new PusherServer({
  appId: getRequiredEnv("PUSHER_APP_ID"),
  key: getRequiredEnv("NEXT_PUBLIC_PUSHER_KEY"),
  secret: getRequiredEnv("PUSHER_SECRET"),
  cluster: getRequiredEnv("NEXT_PUBLIC_PUSHER_CLUSTER"),
  useTLS: true,
})
