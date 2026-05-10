import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { pusher } from "@/lib/pusher";
import { redis } from "@/lib/redis";
import { Player, RoomSettings } from "@/lib/types";
import type { Attempt, RoomState, Vote } from "@/lib/types";
import {
  getRoom,
  joinRoom,
  leaveRoom,
  saveRoom,
  setPlayerReady,
} from "@/lib/rooms";
import { MIN_PLAYERS } from "@/lib/room-constants";
import { getCategoryPrompt } from "@/lib/targets";
import { falGenerate } from "@/lib/fal";
import { awardRoundScores, selectFinalAttempts } from "@/lib/scoring";

// Phase durations (ms). `playing` uses room.settings.timer (host-configurable).
const PICKING_DURATION_MS = 25_000;
const VOTING_DURATION_MS = 25_000;
const REVEAL_DURATION_MS = 20_000;
const GAME_INTRO_DURATION_MS = 6_000;

const JoinAction = z.object({
  action: z.literal("join"),
  name: z.string().min(1).max(30),
  avatarSeed: z.string(),
});

const LeaveAction = z.object({
  action: z.literal("leave"),
});

const UpdateAction = z.object({
  action: z.literal("update"),
  settings: RoomSettings,
});

const ReadyAction = z.object({
  action: z.literal("ready"),
});

const UnreadyAction = z.object({
  action: z.literal("unready"),
});

const StartAction = z.object({
  action: z.literal("start"),
});

const AdvanceAction = z.object({
  action: z.literal("advance"),
});

const PickAction = z.object({
  action: z.literal("pick"),
  attemptId: z.string(),
});

const RestartAction = z.object({
  action: z.literal("restart"),
});

const RoomAction = z.discriminatedUnion("action", [
  JoinAction,
  LeaveAction,
  UpdateAction,
  ReadyAction,
  UnreadyAction,
  StartAction,
  AdvanceAction,
  PickAction,
  RestartAction,
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const room = await getRoom(code);
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  return NextResponse.json({ room });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { code } = await params;
  const room = await getRoom(code);
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = RoomAction.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { action } = parsed.data;

  if (action === "join") {
    const { name, avatarSeed } = parsed.data;

    const player: Player = {
      userId,
      name,
      avatarSeed,
      role: "spectator",
      ready: false,
      joinedAt: Date.now(),
      connected: true,
      lastSeenAt: Date.now(),
    };

    const { room: updatedRoom, role } = await joinRoom(room, player);

    await pusher.trigger(`presence-room-${code}`, "player-joined", {
      userId,
      name,
      avatarSeed,
      role,
    });

    return NextResponse.json({ room: updatedRoom, role });
  }

  if (action === "leave") {
    const updatedRoom = await leaveRoom(room, userId);

    await pusher.trigger(`presence-room-${code}`, "player-left", {
      userId,
    });

    return NextResponse.json({ room: updatedRoom });
  }

  if (action === "update") {
    if (room.hostId !== userId) {
      return NextResponse.json({ error: "host only" }, { status: 403 });
    }
    if (room.status !== "lobby") {
      return NextResponse.json(
        { error: "settings locked once round starts" },
        { status: 409 },
      );
    }

    room.settings = parsed.data.settings;
    await saveRoom(room);

    await pusher.trigger(`presence-room-${code}`, "settings-updated", {
      settings: room.settings,
    });

    return NextResponse.json({ room });
  }

  if (action === "ready" || action === "unready") {
    const player = room.players.find((p) => p.userId === userId);
    if (!player) {
      return NextResponse.json({ error: "not in room" }, { status: 403 });
    }
    if (player.role !== "prompter") {
      return NextResponse.json(
        { error: "only prompters can ready" },
        { status: 403 },
      );
    }
    const { room: updatedRoom } = await setPlayerReady(
      room,
      userId,
      action === "ready",
    );

    await pusher.trigger(`presence-room-${code}`, "player-ready", {
      userId,
      ready: player.ready,
    });

    return NextResponse.json({ room: updatedRoom });
  }

  if (action === "start") {
    if (room.hostId !== userId) {
      return NextResponse.json({ error: "host only" }, { status: 403 });
    }
    if (room.status !== "lobby") {
      return NextResponse.json(
        { error: "game already started" },
        { status: 409 },
      );
    }

    const nonHostPrompters = room.players.filter(
      (p) => p.userId !== room.hostId && p.role === "prompter",
    );
    // Minimum 3 players total (host + 2 non-host prompters).
    if (room.players.length < MIN_PLAYERS || nonHostPrompters.length < 2) {
      return NextResponse.json(
        { error: "need at least 3 players to start" },
        { status: 400 },
      );
    }
    if (!nonHostPrompters.every((p) => p.ready)) {
      return NextResponse.json(
        { error: "not all prompters ready" },
        { status: 400 },
      );
    }

    // Lobby → game-intro: short slideshow before the first round generates.
    room.status = "game-intro";
    room.phaseEndsAt = Date.now() + GAME_INTRO_DURATION_MS;
    await saveRoom(room);
    await pusher.trigger(`presence-room-${code}`, "game-intro-starting", {
      status: "game-intro",
      phaseEndsAt: room.phaseEndsAt,
    });
    return NextResponse.json({ room });
  }

  if (action === "advance") {
    // Any player in the room can fire `advance`. The phase deadline check
    // below is the actual gate — clients trigger this when their countdown
    // hits 0; the server validates server-stamped `phaseEndsAt` to prevent
    // early advances.
    if (!room.players.some((p) => p.userId === userId)) {
      return NextResponse.json({ error: "not in room" }, { status: 403 });
    }
    if (room.phaseEndsAt != null && Date.now() < room.phaseEndsAt) {
      return NextResponse.json(
        { error: "phase not yet ended", phaseEndsAt: room.phaseEndsAt },
        { status: 409 },
      );
    }

    if (room.status === "playing") {
      // playing → picking: 10s window for each player to choose their final
      // attempt before the voting carousel runs.
      room.status = "picking";
      room.phaseEndsAt = Date.now() + PICKING_DURATION_MS;
      await saveRoom(room);
      await pusher.trigger(`presence-room-${code}`, "picking-starting", {
        status: "picking",
        round: room.currentRound,
        phaseEndsAt: room.phaseEndsAt,
      });
      return NextResponse.json({ room });
    }

    if (room.status === "picking") {
      // picking → voting
      room.status = "voting";
      room.phaseEndsAt = Date.now() + VOTING_DURATION_MS;
      await saveRoom(room);
      await pusher.trigger(`presence-room-${code}`, "voting-starting", {
        status: "voting",
        round: room.currentRound,
        phaseEndsAt: room.phaseEndsAt,
      });
      return NextResponse.json({ room });
    }

    if (room.status === "voting") {
      // voting → reveal: dedup attempts to one final per player (pick → fallback to last-submitted),
      // award vote points, reveal target prompt.
      const attempts =
        ((await redis.get(`room:${code}:attempts:${room.currentRound}`)) as
          | Attempt[]
          | null) ?? [];
      const votes =
        ((await redis.get(`room:${code}:votes:${room.currentRound}`)) as
          | Vote[]
          | null) ?? [];

      const finals = selectFinalAttempts(attempts, room.picks);
      room.scores = awardRoundScores(room.scores, finals, votes);
      room.status = "reveal";
      room.phaseEndsAt = Date.now() + REVEAL_DURATION_MS;
      await saveRoom(room);

      await pusher.trigger(`presence-room-${code}`, "reveal-starting", {
        status: "reveal",
        round: room.currentRound,
        phaseEndsAt: room.phaseEndsAt,
        targetPrompt: room.targetPrompt, // finally surfaced
        scores: room.scores,
      });
      return NextResponse.json({ room });
    }

    if (room.status === "reveal") {
      // reveal → next round OR ended.
      if (room.currentRound >= room.settings.rounds) {
        room.status = "ended";
        room.phaseEndsAt = null;
        await saveRoom(room);
        await pusher.trigger(`presence-room-${code}`, "game-ended", {
          status: "ended",
          scores: room.scores,
        });
        return NextResponse.json({ room });
      }
      return generateRoundTarget(room, code);
    }

    if (room.status === "game-intro") {
      // Pre-game slideshow elapsed → generate round 1.
      return generateRoundTarget(room, code);
    }

    return NextResponse.json(
      { error: `cannot advance from ${room.status}` },
      { status: 409 },
    );
  }

  if (action === "pick") {
    // Pull attemptId off parsed.data while narrowing is still in scope —
    // narrowing is lost across the `await` below for closure-captured access.
    const { attemptId } = parsed.data;

    if (!room.players.some((p) => p.userId === userId)) {
      return NextResponse.json({ error: "not in room" }, { status: 403 });
    }
    if (room.status !== "picking") {
      return NextResponse.json(
        { error: "can only pick during picking phase" },
        { status: 409 },
      );
    }

    // Verify the attempt belongs to this user (else they could "pick"
    // someone else's attempt and have it count for them).
    const attempts =
      ((await redis.get(`room:${code}:attempts:${room.currentRound}`)) as
        | Attempt[]
        | null) ?? [];
    const owns = attempts.some(
      (a) => a.id === attemptId && a.userId === userId,
    );
    if (!owns) {
      return NextResponse.json(
        { error: "attempt not found or not yours" },
        { status: 400 },
      );
    }

    room.picks = { ...room.picks, [userId]: attemptId };
    await saveRoom(room);
    // Pick stays private — broadcast existence only so others can see "X picked".
    await pusher.trigger(`presence-room-${code}`, "pick-changed", {
      userId,
      round: room.currentRound,
    });
    return NextResponse.json({ room });
  }

  if (action === "restart") {
    if (room.hostId !== userId) {
      return NextResponse.json({ error: "host only" }, { status: 403 });
    }
    if (room.status !== "ended") {
      return NextResponse.json(
        { error: "can only restart from ended state" },
        { status: 409 },
      );
    }

    // Delete all attempt and vote keys from the finished game.
    const roundsPlayed = room.currentRound;
    const deleteKeys = [];
    for (let r = 1; r <= roundsPlayed; r++) {
      deleteKeys.push(`room:${code}:attempts:${r}`, `room:${code}:votes:${r}`);
    }
    if (deleteKeys.length > 0) await redis.del(...deleteKeys);

    // Reset room back to lobby state, preserving players, host, and settings.
    room.status = "lobby";
    room.currentRound = 0;
    room.targetId = null;
    room.seed = null;
    room.targetImageUrl = null;
    room.targetPrompt = null;
    room.scores = {};
    room.picks = {};
    room.phaseEndsAt = null;
    room.players = room.players.map((p) => ({ ...p, ready: false }));

    await saveRoom(room);
    await pusher.trigger(`presence-room-${code}`, "game-restarted", {
      status: "lobby",
    });
    return NextResponse.json({ room });
  }
}

// Run the keystone composition: getCategoryPrompt → falGenerate.
// Used by the `start` action (lobby → round 1) and the `advance` action when
// transitioning out of `reveal` to round N+1.
//
// Side-effects: increments room.currentRound, flips status through
// generating → playing, stamps phaseEndsAt for the playing phase, broadcasts
// `round-generating` and (on success) `round-starting`. On FLUX failure,
// reverts to lobby and broadcasts `round-failed`.
async function generateRoundTarget(
  room: RoomState,
  code: string,
): Promise<NextResponse> {
  // Phase 1: flip to "generating" + unready players + clear stale round data.
  room.status = "generating";
  room.currentRound += 1;
  room.targetImageUrl = null;
  room.targetPrompt = null;
  room.seed = null;
  room.phaseEndsAt = null;
  room.picks = {};
  room.players.forEach((p) => {
    p.ready = false;
  });
  await saveRoom(room);
  await pusher.trigger(`presence-room-${code}`, "round-generating", {
    status: "generating",
    round: room.currentRound,
  });

  // Phase 2: FLUX target.
  try {
    const { prompt, seed } = getCategoryPrompt(room.settings.category);
    const { imageUrl } = await falGenerate(prompt, seed);

    room.targetImageUrl = imageUrl;
    room.targetPrompt = prompt; // server-only until reveal
    room.seed = seed;
    room.status = "playing";
    // Total playing-phase budget = memorize (image visible) + timer (prompting).
    // Client splits these locally based on remaining vs settings.timer.
    room.phaseEndsAt =
      Date.now() + (room.settings.memorizeTime + room.settings.timer) * 1000;
    await saveRoom(room);

    await pusher.trigger(`presence-room-${code}`, "round-starting", {
      status: "playing",
      round: room.currentRound,
      targetImageUrl: imageUrl,
      category: room.settings.category,
      phaseEndsAt: room.phaseEndsAt,
    });

    return NextResponse.json({ room });
  } catch (err) {
    console.error("Round generation failed:", err);
    // Revert to lobby on FLUX failure so the host can retry.
    room.status = "lobby";
    room.targetImageUrl = null;
    room.targetPrompt = null;
    room.seed = null;
    room.phaseEndsAt = null;
    await saveRoom(room);
    await pusher.trigger(`presence-room-${code}`, "round-failed", {
      error: err instanceof Error ? err.message : "round generation failed",
    });
    return NextResponse.json(
      {
        error: "round generation failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
