import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"
import { pusher } from "@/lib/pusher"
import type { Player } from "@/lib/types"
import { getRoom, joinRoom, leaveRoom } from "@/lib/rooms"

const JoinAction = z.object({
  action: z.literal("join"),
  name: z.string().min(1).max(30),
  avatarSeed: z.string(),
})

const LeaveAction = z.object({
  action: z.literal("leave"),
})

const RoomAction = z.discriminatedUnion("action", [JoinAction, LeaveAction])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const room = await getRoom(code)
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 })
  }
  return NextResponse.json({ room })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const cookieStore = await cookies()
  const userId = cookieStore.get("user_id")?.value
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const { code } = await params
  const room = await getRoom(code)
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 })
  }

  const body = await request.json()
  const parsed = RoomAction.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { action } = parsed.data

  if (action === "join") {
    const { name, avatarSeed } = parsed.data

    const player: Player = {
      userId,
      name,
      avatarSeed,
      role: "spectator",
      ready: false,
      joinedAt: Date.now(),
      connected: true,
      lastSeenAt: Date.now(),
    }

    const { room: updatedRoom, role } = await joinRoom(room, player)

    await pusher.trigger(`presence-room-${code}`, "player-joined", {
      userId,
      name,
      avatarSeed,
      role,
    })

    return NextResponse.json({ room: updatedRoom, role })
  }

  if (action === "leave") {
    const updatedRoom = await leaveRoom(room, userId)

    await pusher.trigger(`presence-room-${code}`, "player-left", {
      userId,
    })

    return NextResponse.json({ room: updatedRoom })
  }
}
