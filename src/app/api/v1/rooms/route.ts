import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { pusher } from "@/lib/pusher"
import { CreateRoomInput, Player } from "@/lib/types"
import { createRoom } from "@/lib/rooms"

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const userId = cookieStore.get("user_id")?.value
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const body = await request.json()
  const parsed = CreateRoomInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, avatarSeed, settings } = parsed.data

  const host: Player = {
    userId,
    name,
    avatarSeed,
    role: "prompter",
    ready: false,
    joinedAt: Date.now(),
    connected: true,
    lastSeenAt: Date.now(),
  }

  const room = await createRoom(settings, host)

  await pusher.trigger(`presence-room-${room.code}`, "player-joined", {
    userId,
    name,
    avatarSeed,
    role: host.role,
  })

  return NextResponse.json({ room })
}
