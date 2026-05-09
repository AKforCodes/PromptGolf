"use client";

import Pusher from "pusher-js";
import { getRequiredEnv } from "./env";

let client: Pusher | null = null;

export function getPusher(): Pusher {
  if (client) return client;

  client = new Pusher(getRequiredEnv("NEXT_PUBLIC_PUSHER_KEY"), {
    cluster: getRequiredEnv("NEXT_PUBLIC_PUSHER_CLUSTER"),
    forceTLS: true,
    channelAuthorization: {
      endpoint: "/api/v1/pusher/auth",
      transport: "ajax",
    },
  });

  return client;
}
