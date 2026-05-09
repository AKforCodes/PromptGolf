import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"
import { pusher } from "@/lib/pusher"
import { Player, RoomSettings } from "@/lib/types"
import { getRoom, joinRoom, leaveRoom, saveRoom } from "@/lib/rooms"

const JoinAction = z.object({
  action: z.literal("join"),
  name: z.string().min(1).max(30),
  avatarSeed: z.string(),
})

const LeaveAction = z.object({
  action: z.literal("leave"),
})

const UpdateAction = z.object({
  action: z.literal("update"),
  settings: RoomSettings,
})

const ReadyAction = z.object({
  action: z.literal("ready"),
})

const UnreadyAction = z.object({
  action: z.literal("unready"),
})

const StartAction = z.object({
  action: z.literal("start"),
})

const RoomAction = z.discriminatedUnion("action", [
  JoinAction,
  LeaveAction,
  UpdateAction,
  ReadyAction,
  UnreadyAction,
  StartAction,
])

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

  if (action === "update") {
    if (room.hostId !== userId) {
      return NextResponse.json({ error: "host only" }, { status: 403 })
    }
    if (room.status !== "lobby") {
      return NextResponse.json(
        { error: "settings locked once round starts" },
        { status: 409 }
      )
    }

    room.settings = parsed.data.settings
    await saveRoom(room)

    await pusher.trigger(`presence-room-${code}`, "settings-updated", {
      settings: room.settings,
    })

    return NextResponse.json({ room })
  }

  if (action === "ready" || action === "unready") {
    const player = room.players.find((p) => p.userId === userId)
    if (!player) {
      return NextResponse.json({ error: "not in room" }, { status: 403 })
    }

    player.ready = action === "ready"
    await saveRoom(room)

    await pusher.trigger(`presence-room-${code}`, "player-ready", {
      userId,
      ready: player.ready,
    })

    return NextResponse.json({ room })
  }

  if (action === "start") {
    if (room.hostId !== userId) {
      return NextResponse.json({ error: "host only" }, { status: 403 })
    }
    if (room.status !== "lobby") {
      return NextResponse.json({ error: "game already started" }, { status: 409 })
    }
    if (room.players.length < 2) {
      return NextResponse.json({ error: "need at least 2 players" }, { status: 400 })
    }
    if (!room.players.every((p) => p.ready)) {
      return NextResponse.json({ error: "not all players ready" }, { status: 400 })
    }

    room.status = "playing"
    room.currentRound = 1
    for (const p of room.players) {
      p.ready = false
    }
    await saveRoom(room)

    await pusher.trigger(`presence-room-${code}`, "round-starting", {
      status: "playing",
      round: room.currentRound,
    })

    return NextResponse.json({ room })
  }
}
