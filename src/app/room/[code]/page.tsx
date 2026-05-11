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
import { LobbyPlayersList } from "@/components/lobby/lobby-players-list";
import { PresetGrid } from "@/components/lobby/preset-grid";
import { RoundSummaryCard } from "@/components/lobby/round-summary-card";
import { MicPermissionButton } from "@/components/lobby/mic-permission-button";
import { applyPreset } from "@/lib/presets";
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location is browser-only; cannot lazy-init without hydration mismatch
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirroring server-driven settings into local state for non-hosts; alternative would require restructuring host/non-host into separate components
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
    <LobbyView
      code={code}
      shareUrl={shareUrl}
      roomState={roomState}
      userId={userId}
      isHost={isHost}
      isSpectator={isSpectator}
      myReady={myReady}
      readyBusy={readyBusy}
      readyCount={readyCount}
      allReady={allReady}
      nonHostPromptersCount={nonHostPrompters.length}
      canStart={canStart}
      startError={startError}
      roundError={roundError}
      settings={settings}
      onUpdate={update}
      onApplyPreset={(presetId) => {
        if (!isHost) return;
        setLocalSettings((s) => applyPreset(s ?? settings, presetId));
      }}
      onReadyToggle={handleReadyToggle}
      onStart={handleStart}
      onLeave={handleLeave}
    />
  );
}

// --- Lobby view (extracted for clarity) ---

type SettingsTab = "presets" | "custom";

interface LobbyViewProps {
  code: string;
  shareUrl: string;
  roomState: RoomState;
  userId: string;
  isHost: boolean;
  isSpectator: boolean;
  myReady: boolean;
  readyBusy: boolean;
  readyCount: number;
  allReady: boolean;
  nonHostPromptersCount: number;
  canStart: boolean;
  startError: string | null;
  roundError: string | null;
  settings: RoomSettings;
  onUpdate: <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) => void;
  onApplyPreset: (presetId: string) => void;
  onReadyToggle: () => void;
  onStart: () => void;
  onLeave: () => void;
}

function LobbyView(props: LobbyViewProps) {
  const {
    code,
    shareUrl,
    roomState,
    userId,
    isHost,
    isSpectator,
    myReady,
    readyBusy,
    readyCount,
    allReady,
    nonHostPromptersCount,
    canStart,
    startError,
    roundError,
    settings,
    onUpdate,
    onApplyPreset,
    onReadyToggle,
    onStart,
    onLeave,
  } = props;

  const [tab, setTab] = useState<SettingsTab>("presets");
  const [copied, setCopied] = useState(false);

  const copyInvite = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("clipboard failed:", err);
    }
  }, [shareUrl]);

  const startLabel =
    roomState.players.length < MIN_PLAYERS
      ? `Need ${MIN_PLAYERS - roomState.players.length} more`
      : !allReady
        ? `${readyCount}/${nonHostPromptersCount} ready`
        : "▶ Start Game";

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-4 pb-6 pt-4">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(34,197,94,0.18), transparent 55%), radial-gradient(ellipse at bottom right, rgba(250,204,21,0.14), transparent 55%)",
        }}
      />
      <div
        aria-hidden="true"
        className="halftone pointer-events-none absolute inset-0 opacity-50"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col">
        {/* Top bar */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="neutral" size="sm" onClick={onLeave}>
            ← Leave
          </Button>

          {/* Big room code badge — clickable to copy */}
          <button
            type="button"
            onClick={copyInvite}
            disabled={!shareUrl}
            title={copied ? "Copied!" : "Click to copy invite link"}
            className="press group inline-flex items-center gap-3 rounded-2xl border-[3px] border-ink bg-sun px-4 py-2 shadow-chunky-sm cursor-pointer disabled:cursor-not-allowed"
          >
            <span className="flex flex-col items-start leading-none">
              <span className="font-heading text-[9px] font-bold uppercase tracking-wide text-ink/55">
                room code
              </span>
              <span className="mt-0.5 font-heading text-2xl font-extrabold tabular-nums tracking-[0.4em] sm:text-3xl">
                {code}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="rounded-full border-2 border-ink bg-white px-1.5 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide"
            >
              {copied ? "✓ copied" : "🔗 copy"}
            </span>
          </button>
        </div>

        {/* Two-zone layout */}
        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
          {/* LEFT — Players */}
          <div className="lg:col-span-4">
            <LobbyPlayersList
              players={roomState.players}
              hostId={roomState.hostId}
              selfId={userId}
              maxPlayers={settings.maxPlayers}
            />
          </div>

          {/* RIGHT — Settings (host) or Read-only summary (non-host) */}
          <div className="lg:col-span-8">
            {isHost ? (
              <Card className="flex h-full flex-col p-4 sm:p-5">
                {/* Tabs */}
                <div
                  role="tablist"
                  aria-label="Settings mode"
                  className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border-[3px] border-ink bg-cream p-1"
                >
                  <button
                    role="tab"
                    type="button"
                    aria-selected={tab === "presets"}
                    onClick={() => setTab("presets")}
                    className={`press rounded-xl border-2 py-2 font-heading text-sm font-extrabold uppercase tracking-wide cursor-pointer transition ${
                      tab === "presets"
                        ? "border-ink bg-golf shadow-chunky-sm"
                        : "border-transparent text-ink/60"
                    }`}
                  >
                    ⚡ Presets
                  </button>
                  <button
                    role="tab"
                    type="button"
                    aria-selected={tab === "custom"}
                    onClick={() => setTab("custom")}
                    className={`press rounded-xl border-2 py-2 font-heading text-sm font-extrabold uppercase tracking-wide cursor-pointer transition ${
                      tab === "custom"
                        ? "border-ink bg-sun shadow-chunky-sm"
                        : "border-transparent text-ink/60"
                    }`}
                  >
                    ⚙ Custom Settings
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-1 py-1">
                  {tab === "presets" ? (
                    <PresetGrid
                      settings={settings}
                      onApply={onApplyPreset}
                    />
                  ) : (
                    <GameSetupCard
                      settings={settings}
                      onChange={onUpdate}
                      bare
                    />
                  )}
                </div>
              </Card>
            ) : (
              <div className="flex h-full flex-col gap-4">
                <div className="rounded-2xl border-[3px] border-dashed border-ink/40 bg-white/70 p-3 text-center backdrop-blur">
                  <p className="font-heading text-xs font-bold uppercase tracking-wide text-ink/55">
                    🎮 Host is setting up the game
                  </p>
                  <p className="mt-1 font-heading text-[11px] text-ink/45">
                    here&apos;s what you&apos;ll be playing
                  </p>
                </div>
                <RoundSummaryCard settings={settings} />
              </div>
            )}
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="mt-4 flex flex-col items-stretch gap-2 rounded-2xl border-[3px] border-ink bg-white/90 p-3 shadow-chunky-sm backdrop-blur sm:flex-row sm:items-center">
          <MicPermissionButton />
          {!isHost && !isSpectator && (
            <Button
              variant={myReady ? "primary" : "secondary"}
              size="md"
              full
              onClick={onReadyToggle}
              disabled={readyBusy}
            >
              {myReady ? "✓ Ready" : "Ready Up"}
            </Button>
          )}
          {isHost && (
            <Button
              variant="primary"
              size="md"
              full
              onClick={onStart}
              disabled={!canStart}
            >
              {startLabel}
            </Button>
          )}
        </div>

        {(startError || roundError) && (
          <p
            role="alert"
            className="mt-3 rounded-xl border-[3px] border-ink bg-pink px-4 py-2 text-center font-heading text-sm font-semibold"
          >
            {startError ?? roundError}
          </p>
        )}
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
