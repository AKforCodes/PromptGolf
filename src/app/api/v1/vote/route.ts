import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"
import { pusher } from "@/lib/pusher"
import { redis } from "@/lib/redis"
import { getRoom } from "@/lib/rooms"
import type { Vote } from "@/lib/types"

const VOTE_TTL = 3600

const VoteInput = z.object({
  roomCode: z.string().length(4),
  targetUserId: z.string(),
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
  const { roomCode, targetUserId } = parsed.data

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
  // During a tiebreaker, only tied players' attempts are votable.
  if (
    room.tiebreakerPlayers != null &&
    !room.tiebreakerPlayers.includes(targetUserId)
  ) {
    return NextResponse.json(
      { error: "tiebreaker round — only tied players may receive votes" },
      { status: 400 },
    )
  }
  if (room.status !== "voting") {
    return NextResponse.json({ error: "voting is not active" }, { status: 409 })
  }

  // Each voter has exactly one vote per round. Upsert: drop any prior vote
  // by this voter, append the new one. Lets players change their mind during
  // the voting phase; last vote wins.
  const key = votesKey(roomCode, room.currentRound)
  const existing = ((await redis.get(key)) as Vote[] | null) ?? []
  const otherVotes = existing.filter((v) => v.voterId !== userId)

  const vote: Vote = {
    voterId: userId,
    targetId: targetUserId,
    submittedAt: Date.now(),
  }
  const votes = [...otherVotes, vote]
  await redis.set(key, votes, { ex: VOTE_TTL })

  // Broadcast existence only — voted-for target stays private until reveal.
  await pusher.trigger(`presence-room-${roomCode}`, "vote-submitted", {
    voterId: userId,
    round: room.currentRound,
  })

  return NextResponse.json({ vote })
}
