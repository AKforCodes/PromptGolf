"use client";

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Channel } from "pusher-js";
import type { Player, RoomSettings, RoomState } from "@/lib/types";
import { MIN_PLAYERS } from "@/lib/room-constants";
import { tryCatch } from "@/lib/result";
import {
  advanceRoom,
  ApiError,
  getRoom,
  joinRoom,
  leaveRoom,
  readyRoom,
  seedUser,
  startRoom,
  updateRoomSettings,
} from "@/lib/api";
import { getPusher } from "@/lib/pusher-client";
import { randomGuestName } from "@/lib/guest-name";
import { useSoundEffect } from "@/components/sound-provider";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { GameSetupCard } from "@/components/lobby/game-setup-card";
import { JoinPrompt } from "@/components/lobby/join-prompt";
import { PlayersCard } from "@/components/lobby/players-card";
import { RoundSummaryCard } from "@/components/lobby/round-summary-card";
import { ShareCard } from "@/components/lobby/share-card";
import { MicPermissionButton } from "@/components/lobby/mic-permission-button";
import { PlayingView } from "@/components/play/playing-view";
import { SpectatorView } from "@/components/play/spectator-view";
import { RoundLoadingView } from "@/components/play/round-loading-view";
import { PickingView } from "@/components/play/picking-view";
import { GameIntroView } from "@/components/play/game-intro-view";
import {
  EndedView,
  RevealView,
  VotingView,
} from "@/components/play/phase-views";

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

type Phase = "loading" | "needs-name" | "ready";

const FALLBACK_SETTINGS: RoomSettings = {
  gameMode: "showdown",
  rounds: 3,
  maxPlayers: 8,
  timer: 60,
  memorizeTime: 20,
  promptMaxLength: 200,
  attemptsPerRound: 3,
  category: "animals",
  difficulty: "normal",
};

function RoomLobby({ code }: { code: string }) {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [readyBusy, setReadyBusy] = useState<boolean>(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [roundError, setRoundError] = useState<string | null>(null);
  const { playBubble } = useSoundEffect();
  const [shareUrl, setShareUrl] = useState<string>("");

  const [joinName, setJoinName] = useState<string>("");
  const [joinBusy, setJoinBusy] = useState<boolean>(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [localSettings, setLocalSettings] = useState<RoomSettings | null>(null);

  const isHost = useMemo(
    () => Boolean(roomState && userId && roomState.hostId === userId),
    [roomState, userId],
  );

  const channelRef = useRef<Channel | null>(null);

  const refetchRoom = useCallback(async (): Promise<RoomState | null> => {
    const [err, data] = await tryCatch(getRoom(code));
    if (err) {
      console.error("Failed to refetch room:", err);
      return null;
    }
    setRoomState(data.room);
    return data.room;
  }, [code]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/room/${code}`);
    }
  }, [code]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const [seedErr, seedData] = await tryCatch(seedUser());
      if (cancelled) return;
      if (seedErr) {
        setFatalError("Could not start a session.");
        return;
      }
      const uid = seedData.user_id;
      setUserId(uid);

      const [getErr, getData] = await tryCatch(getRoom(code));
      if (cancelled) return;
      if (getErr) {
        setFatalError(
          getErr instanceof ApiError && getErr.status === 404
            ? "Room not found."
            : "Could not load the room.",
        );
        return;
      }

      const room = getData.room;
      const alreadyIn = room.players.some((p) => p.userId === uid);

      if (alreadyIn) {
        setRoomState(room);
        setLocalSettings(room.settings);
        setPhase("ready");
      } else {
        setJoinName(randomGuestName());
        setPhase("needs-name");
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (phase !== "ready") return;

    const pusher = getPusher();
    const channelName = `presence-room-${code}`;
    const channel = pusher.subscribe(channelName);
    channelRef.current = channel;

    const onChange = () => {
      void refetchRoom();
    };

    channel.bind("pusher:subscription_error", (status: unknown) => {
      console.error("Pusher subscription error", status);
    });
    channel.bind("pusher:member_added", onChange);
    channel.bind("pusher:member_removed", onChange);
    channel.bind("player-joined", onChange);
    channel.bind("player-left", onChange);
    channel.bind("player-ready", onChange);
    channel.bind("settings-updated", onChange);
    channel.bind("round-generating", onChange);
    channel.bind("round-starting", onChange);
    channel.bind("round-failed", (data: { error?: string }) => {
      console.error("Round failed:", data.error);
      setRoundError(data.error ?? "Round generation failed");
      void refetchRoom();
    });
    channel.bind("attempt-submitted", onChange);
    channel.bind("picking-starting", onChange);
    channel.bind("pick-changed", onChange);
    channel.bind("voting-starting", onChange);
    channel.bind("vote-submitted", onChange);
    channel.bind("reveal-starting", onChange);
    channel.bind("game-intro-starting", onChange);
    channel.bind("game-ended", onChange);
    channel.bind("game-restarted", onChange);

    return () => {
      const ch = channelRef.current;
      if (ch) {
        ch.unbind_all();
        pusher.unsubscribe(channelName);
        channelRef.current = null;
      }
    };
  }, [phase, code, refetchRoom]);

  // Page-level auto-advance. When the server-stamped phase deadline elapses,
  // any client can fire `advance` — the server gates on phaseEndsAt so a
  // tiny race between clients is harmless (later one gets a 409 and we
  // ignore it). The ref ensures we fire at most once per deadline.
  const advancedForRef = useRef<number | null>(null);
  useEffect(() => {
    if (!roomState) return;
    if (phase !== "ready") return;
    const { status, phaseEndsAt } = roomState;
    if (phaseEndsAt == null) return;
    if (
      status !== "playing" &&
      status !== "picking" &&
      status !== "voting" &&
      status !== "reveal" &&
      status !== "game-intro"
    ) {
      return;
    }

    let cancelled = false;
    const fire = async () => {
      if (cancelled) return;
      if (advancedForRef.current === phaseEndsAt) return;
      advancedForRef.current = phaseEndsAt;
      const [err] = await tryCatch(advanceRoom(code));
      if (err && !(err instanceof ApiError && err.status === 409)) {
        console.error("advance failed:", err);
      }
    };

    const remaining = phaseEndsAt - Date.now();
    if (remaining <= 0) {
      void fire();
      return;
    }
    const timeout = setTimeout(() => void fire(), remaining + 50);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [roomState, phase, code]);

  // Non-host: keep local settings mirrored from server.
  useEffect(() => {
    if (!roomState) return;
    if (!isHost) {
      setLocalSettings(roomState.settings);
    }
  }, [roomState, isHost]);

  // Host: debounced sync of local settings → server.
  useEffect(() => {
    if (!isHost) return;
    if (phase !== "ready") return;
    if (!localSettings || !roomState) return;
    if (JSON.stringify(localSettings) === JSON.stringify(roomState.settings)) {
      return;
    }

    const timer = setTimeout(async () => {

      const [err] = await tryCatch(updateRoomSettings(code, localSettings));
      if (err) {
        console.error("Failed to sync settings:", err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localSettings, roomState, isHost, phase, code]);

  const settings: RoomSettings = localSettings ?? FALLBACK_SETTINGS;
  const players: Player[] = roomState?.players ?? [];
  const myRole =
    players.find((p) => p.userId === userId)?.role ?? null;
  const isSpectator = myRole === "spectator";
  const nonHostPrompters = roomState
    ? players.filter(
        (p) => p.userId !== roomState.hostId && p.role === "prompter",
      )
    : [];
  const readyCount = nonHostPrompters.filter((p) => p.ready).length;
  const allReady =
    nonHostPrompters.length > 0 &&
    readyCount === nonHostPrompters.length;
  const canStart = isHost && allReady && players.length >= MIN_PLAYERS;
  const myReady = players.find((p) => p.userId === userId)?.ready ?? false;

  const update = <K extends keyof RoomSettings>(
    key: K,
    value: RoomSettings[K],
  ) => {
    if (!isHost) return;
    setLocalSettings((s) => ({ ...(s ?? settings), [key]: value }));
  };

  const handleJoinSubmit = async (name: string) => {
    if (joinBusy) return;
    playBubble();
    if (!name) {
      setJoinError("Pick a name first");
      return;
    }
    setJoinError(null);
    setJoinBusy(true);

    const [err, data] = await tryCatch(joinRoom(code, name, userId));
    if (err) {
      setJoinError(
        err instanceof ApiError && err.status === 404
          ? "Room not found."
          : "Could not join this room.",
      );
      setJoinBusy(false);
      return;
    }

    setRoomState(data.room);
    setLocalSettings(data.room.settings);
    setJoinBusy(false);
    setPhase("ready");
  };

  const handleReadyToggle = async () => {
    if (readyBusy) return;
    playBubble();
    setReadyBusy(true);
    const next = !myReady;
    const [err, data] = await tryCatch(readyRoom(code, next));
    if (err) {
      console.error("Ready toggle failed:", err);
      setReadyBusy(false);
      return;
    }
    setRoomState(data.room);
    setReadyBusy(false);
  };

  const handleStart = async () => {
    if (!canStart) return;
    playBubble();
    setStartError(null);
    setRoundError(null);
    const [err, data] = await tryCatch(startRoom(code));
    if (err) {
      console.error("Start failed:", err);
      setStartError(
        err instanceof ApiError
          ? err.message || `Couldn't start (${err.status})`
          : "Network error",
      );
      return;
    }
    setRoomState(data.room);
  };

  const handleLeave = async () => {
    playBubble();
    await tryCatch(leaveRoom(code));
    router.push("/");
  };

  if (fatalError) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-md p-8 text-center">
          <p className="font-heading text-2xl font-bold">{fatalError}</p>
          <Button
            variant="primary"
            size="md"
            onClick={() => router.push("/")}
            className="mt-6"
          >
            Back to start
          </Button>
        </Card>
      </main>
    );
  }

  if (phase === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-heading text-2xl">Loading room…</div>
      </main>
    );
  }

  if (phase === "needs-name") {
    return (
      <JoinPrompt
        code={code}
        initialName={joinName}
        busy={joinBusy}
        error={joinError}
        onSubmit={handleJoinSubmit}
        onCancel={() => router.push("/")}
        onClearError={() => setJoinError(null)}
      />
    );
  }

  if (!roomState) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-heading text-2xl">Loading room…</div>
      </main>
    );
  }

  if (roomState.status === "game-intro") {
    return (
      <GameIntroView
        roomState={roomState}
        userId={userId}
        onLeave={handleLeave}
      />
    );
  }

  if (roomState.status === "generating") {
    return (
      <RoundLoadingView
        roomState={roomState}
        onLeave={handleLeave}
        onRefetch={refetchRoom}
      />
    );
  }

  if (roomState.status === "playing" || roomState.status === "countdown") {
    if (isSpectator) {
      return (
        <SpectatorView
          key={roomState.currentRound}
          code={code}
          roomState={roomState}
          userId={userId}
          onLeave={handleLeave}
        />
      );
    }
    return (
      <PlayingView
        key={roomState.currentRound}
        code={code}
        roomState={roomState}
        userId={userId}
        onLeave={handleLeave}
      />
    );
  }

  if (roomState.status === "picking") {
    return (
      <PickingView
        key={roomState.currentRound}
        code={code}
        roomState={roomState}
        userId={userId}
        onLeave={handleLeave}
      />
    );
  }

  if (roomState.status === "voting") {
    return (
      <VotingView
        code={code}
        roomState={roomState}
        userId={userId}
        onLeave={handleLeave}
      />
    );
  }

  if (roomState.status === "reveal") {
    return (
      <RevealView roomState={roomState} userId={userId} onLeave={handleLeave} />
    );
  }

  if (roomState.status === "ended") {
    return (
      <EndedView roomState={roomState} userId={userId} onLeave={handleLeave} code={code} />
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="neutral" size="sm" onClick={handleLeave}>
            ← Leave
          </Button>
          <div className="font-heading text-xl">⛳️ PROMPT GOLF</div>
        </div>

        <ShareCard code={code} shareUrl={shareUrl} />

        {isHost ? (
          <GameSetupCard settings={settings} onChange={update} />
        ) : (
          <RoundSummaryCard settings={settings} />
        )}

        <PlayersCard
          players={players}
          hostId={roomState.hostId}
          selfId={userId}
          maxPlayers={settings.maxPlayers}
        />

        <div className="flex flex-col gap-3">
          {!isHost && !isSpectator && (
            <Button
              variant={myReady ? "primary" : "secondary"}
              size="lg"
              full
              onClick={handleReadyToggle}
              disabled={readyBusy}
            >
              {myReady ? "✓ Ready" : "Tap to Ready Up"}
            </Button>
          )}
          {isHost && (
            <Button
              variant="primary"
              size="lg"
              full
              onClick={handleStart}
              disabled={!canStart}
            >
              {players.length < MIN_PLAYERS
                ? `Waiting for players… ${readyCount}/${players.length} ready`
                : !allReady
                  ? `${readyCount}/${nonHostPrompters.length} ready`
                  : "Start Round"}
            </Button>
          )}
          {(startError || roundError) && (
            <p
              role="alert"
              className="rounded-xl border-[3px] border-ink bg-pink px-4 py-2 text-center font-heading text-sm font-semibold"
            >
              {startError ?? roundError}
            </p>
          )}
          <MicPermissionButton />
          <p className="text-center font-heading text-xs text-ink/50">
            share the room code or link so friends can join
          </p>
        </div>
      </div>
    </main>
  );
}

export default function RoomPage({ params }: RoomPageProps) {
  const { code } = use(params);
  const upper = code.toUpperCase();

  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="font-heading text-2xl">Loading room…</div>
        </main>
      }
    >
      <RoomLobby code={upper} />
    </Suspense>
  );
}
