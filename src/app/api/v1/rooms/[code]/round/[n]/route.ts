import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getRoom } from "@/lib/rooms";
import { selectFinalAttempts } from "@/lib/scoring";
import type { Attempt, Vote } from "@/lib/types";

// GET /api/v1/rooms/[code]/round/[n]
//
// Returns the data the voting and reveal screens need:
//   - finalAttempts: one Attempt per player (their pick, or fallback to
//     last-submitted). This is the voting carousel.
//   - votes: all votes cast for this round.
//   - targetImageUrl: the round's target image (always available once round
//     has reached playing).
//   - targetPrompt: only included once status === "reveal" or "ended" — that's
//     the moment the secret is surfaced.
//
// Caller must be in the room. Reading future rounds (n > currentRound) is
// rejected.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string; n: string }> },
) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { code, n } = await params;
  const round = Number.parseInt(n, 10);
  if (!Number.isFinite(round) || round < 1) {
    return NextResponse.json(
      { error: "invalid round number" },
      { status: 400 },
    );
  }

  const room = await getRoom(code);
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (!room.players.some((p) => p.userId === userId)) {
    return NextResponse.json({ error: "not in room" }, { status: 403 });
  }
  if (round > room.currentRound) {
    return NextResponse.json(
      { error: "round not yet played" },
      { status: 404 },
    );
  }

  const attempts =
    ((await redis.get(`room:${code}:attempts:${round}`)) as Attempt[] | null) ??
    [];
  if (process.env.NODE_ENV === "development") {
    console.log(`[round/${round}] attempts count = ${attempts.length}, userId=${userId}, myAttempts=${attempts.filter((a) => a.userId === userId).length}`);
  }
  const votes =
    ((await redis.get(`room:${code}:votes:${round}`)) as Vote[] | null) ?? [];

  // For the current round, picks live on RoomState.picks. For past rounds,
  // those picks have been wiped — selectFinalAttempts will fall back cleanly.
  const picks = round === room.currentRound ? room.picks : {};
  const finalAttempts = selectFinalAttempts(attempts, picks);

  // The caller's own attempts (un-deduped). PlayingView uses this to populate
  // its attempt list on mount/refresh — Pusher events keep it live thereafter.
  // Other players' attempts stay private until selectFinalAttempts surfaces
  // them at voting time.
  const myAttempts = attempts.filter((a) => a.userId === userId);
  const myPick = picks[userId] ?? null;

  const isCurrentRound = round === room.currentRound;
  const revealed =
    isCurrentRound && (room.status === "reveal" || room.status === "ended");

  return NextResponse.json({
    round,
    finalAttempts,
    myAttempts,
    myPick,
    votes,
    targetImageUrl: isCurrentRound ? room.targetImageUrl : null,
    targetPrompt: revealed ? room.targetPrompt : null,
  });
}
