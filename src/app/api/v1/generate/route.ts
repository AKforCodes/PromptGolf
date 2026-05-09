import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { pusher } from "@/lib/pusher";
import { redis } from "@/lib/redis";
import { getRoom } from "@/lib/rooms";
import { falGenerate } from "@/lib/fal";
import type { Attempt } from "@/lib/types";

const ATTEMPT_TTL = 3600;
const DEBOUNCE_SECONDS = 3;

const nanoidShort = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

const GenerateInput = z.object({
  roomCode: z.string().length(4),
  prompt: z.string().min(1).max(200),
});

function attemptsKey(code: string, round: number): string {
  return `room:${code}:attempts:${round}`;
}

function debounceKey(code: string, userId: string): string {
  return `room:${code}:debounce:${userId}`;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = GenerateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { roomCode, prompt } = parsed.data;

  const room = await getRoom(roomCode);
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (!room.players.some((p) => p.userId === userId)) {
    return NextResponse.json({ error: "not in room" }, { status: 403 });
  }
  if (room.status !== "playing") {
    return NextResponse.json({ error: "round is not active" }, { status: 409 });
  }
  // Reject submissions during the memorize sub-phase (image is still visible
  // to the player). Memorize window = (phaseEndsAt - now) > timer * 1000.
  if (
    room.phaseEndsAt != null &&
    room.phaseEndsAt - Date.now() > room.settings.timer * 1000
  ) {
    return NextResponse.json(
      { error: "still memorizing — wait for the prompt phase" },
      { status: 409 },
    );
  }
  if (prompt.length > room.settings.promptMaxLength) {
    return NextResponse.json(
      { error: `prompt too long (max ${room.settings.promptMaxLength})` },
      { status: 400 },
    );
  }

  // Per-round attempts cap. Read existing attempts so we can both enforce
  // the cap and append after a successful gen — same Redis read serves both.
  const key = attemptsKey(roomCode, room.currentRound);
  const existing = ((await redis.get(key)) as Attempt[] | null) ?? [];
  const usedAttempts = existing.filter((a) => a.userId === userId).length;
  const cap = room.settings.attemptsPerRound;
  if (usedAttempts >= cap) {
    return NextResponse.json(
      { error: `attempt cap reached (${cap} per round)`, attemptsRemaining: 0 },
      { status: 409 },
    );
  }

  // Per-player debounce. Atomic NX + TTL: succeeds if no key exists, fails
  // if the user submitted within the last DEBOUNCE_SECONDS.
  const debounced = await redis.set(debounceKey(roomCode, userId), "1", {
    nx: true,
    ex: DEBOUNCE_SECONDS,
  });
  if (debounced !== "OK") {
    return NextResponse.json(
      { error: `submitting too fast — wait ${DEBOUNCE_SECONDS}s` },
      { status: 429 },
    );
  }

  try {
    // No seed passed — FLUX picks a random one per submission. Identical
    // prompts produce different images, so duplicate-prompt edge cases
    // can't trivially split votes. Determinism is no longer needed since
    // CLIP scoring was dropped.
    const { imageUrl: candidateUrl } = await falGenerate(prompt);

    // similarity/qualified are vestigial — kept on the schema for forward-compat
    // in case CLIP scoring is reintroduced. Defaults are 0/false.
    const attempt: Attempt = {
      id: nanoidShort(),
      userId,
      prompt,
      imageUrl: candidateUrl,
      similarity: 0,
      qualified: false,
      chars: prompt.length,
      tokens: Math.ceil(prompt.length / 4),
      submittedAt: Date.now(),
    };

    const attempts = [...existing, attempt];
    await redis.set(key, attempts, { ex: ATTEMPT_TTL });

    await pusher.trigger(
      `presence-room-${roomCode}`,
      "attempt-submitted",
      attempt,
    );

    return NextResponse.json({
      attempt,
      attemptsRemaining:
        cap - attempts.filter((a) => a.userId === userId).length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "generation failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
