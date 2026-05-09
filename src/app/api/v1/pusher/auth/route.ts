import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { pusher } from "@/lib/pusher"
import { getRoom } from "@/lib/rooms"

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const userId = cookieStore.get("user_id")?.value
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const form = await request.formData()
  const socketId = form.get("socket_id") as string | null
  const channelName = form.get("channel_name") as string | null

  if (!socketId || !channelName) {
    return NextResponse.json({ error: "missing socket_id or channel_name" }, { status: 400 })
  }

  const prefix = "presence-room-"
  if (!channelName.startsWith(prefix)) {
    return NextResponse.json({ error: "invalid channel" }, { status: 400 })
  }

  const roomCode = channelName.slice(prefix.length)
  const room = await getRoom(roomCode)
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 })
  }

  const player = room.players.find((p) => p.userId === userId)
  if (!player) {
    return NextResponse.json({ error: "not in room" }, { status: 403 })
  }

  const auth = pusher.authorizeChannel(socketId, channelName, {
    user_id: userId,
    user_info: {
      name: player.name,
      avatarSeed: player.avatarSeed,
      role: player.role,
    },
  })

  return NextResponse.json(auth)
}
