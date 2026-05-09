import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"
import { pusher } from "@/lib/pusher"
import { redis } from "@/lib/redis"
import { getRoom } from "@/lib/rooms"
import { Vote, VoteValue } from "@/lib/types"

const VOTE_TTL = 3600

const VoteInput = z.object({
  roomCode: z.string().length(4),
  targetUserId: z.string(),
  value: VoteValue,
})

function votesKey(code: string, round: number): string {
  return `room:${code}:votes:${round}`
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const userId = cookieStore.get("user_id")?.value
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const body = await request.json()
  const parsed = VoteInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { roomCode, targetUserId, value } = parsed.data

  if (targetUserId === userId) {
    return NextResponse.json({ error: "cannot vote on yourself" }, { status: 400 })
  }

  const room = await getRoom(roomCode)
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 })
  }
  if (!room.players.some((p) => p.userId === userId)) {
    return NextResponse.json({ error: "not in room" }, { status: 403 })
  }
  if (!room.players.some((p) => p.userId === targetUserId)) {
    return NextResponse.json({ error: "target not in room" }, { status: 400 })
  }
  if (room.status !== "voting") {
    return NextResponse.json({ error: "voting is not active" }, { status: 409 })
  }

  // Read existing votes; reject if voter already voted on this target this round.
  const key = votesKey(roomCode, room.currentRound)
  const existing = ((await redis.get(key)) as Vote[] | null) ?? []
  const already = existing.some(
    (v) => v.voterId === userId && v.targetId === targetUserId
  )
  if (already) {
    return NextResponse.json(
      { error: "already voted on this player this round" },
      { status: 409 }
    )
  }

  const vote: Vote = {
    voterId: userId,
    targetId: targetUserId,
    value,
    submittedAt: Date.now(),
  }
  const votes = [...existing, vote]
  await redis.set(key, votes, { ex: VOTE_TTL })

  // Broadcast existence only — values stay private until the reveal phase.
  await pusher.trigger(`presence-room-${roomCode}`, "vote-submitted", {
    voterId: userId,
    round: room.currentRound,
  })

  return NextResponse.json({ vote })
}
