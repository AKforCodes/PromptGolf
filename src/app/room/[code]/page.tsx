"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Channel } from "pusher-js";
import type { RoomSettings, RoomState, Player } from "@/lib/types";
import { tryCatch } from "@/lib/result";
import {
  ApiError,
  getRoom,
  joinRoom,
  leaveRoom,
  seedUser,
} from "@/lib/api";
import { getPusher } from "@/lib/pusher-client";

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

type Category = RoomSettings["category"];
type Difficulty = RoomSettings["difficulty"];

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 8;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 5;
const MIN_TIMER = 30;
const MAX_TIMER = 120;
const TIMER_STEP = 10;
const PROMPT_LEN_OPTIONS = [50, 100, 150, 200] as const;

const CATEGORIES: { id: Category; label: string; emoji: string; color: string }[] = [
  { id: "animals", label: "Animals", emoji: "🦊", color: "#bbf7d0" },
  { id: "landmarks", label: "Landmarks", emoji: "🗽", color: "#38BDF8" },
  { id: "food", label: "Food", emoji: "🍕", color: "#F472B6" },
  { id: "celebrity", label: "Celebrities", emoji: "🌟", color: "#FACC15" },
  { id: "logos", label: "Logos", emoji: "🏷️", color: "#fda4af" },
];

const DIFFICULTIES: { id: Difficulty; label: string; desc: string; color: string }[] = [
  { id: "easy", label: "Easy", desc: "lower bar to qualify", color: "#bbf7d0" },
  { id: "normal", label: "Normal", desc: "standard threshold", color: "#FACC15" },
  { id: "hard", label: "Hard", desc: "must match closely", color: "#F472B6" },
];

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(seed)}&backgroundColor=fef3c7,fde68a,fef9c3,bbf7d0,bae6fd,fbcfe8`;
}

function CopyIcon({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
  fillColor: string;
  disabled?: boolean;
  onChange: (n: number) => void;
}

function Stepper({ value, min, max, step = 1, ariaLabel, fillColor, disabled, onChange }: StepperProps) {
  const bump = (delta: number) => {
    if (disabled) return;
    onChange(clamp(value + delta * step, min, max));
  };
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-2xl border-[3px] border-[#0A0A0A] bg-[#FFF8E7] shadow-chunky-sm">
      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${ariaLabel}`}
        className="press flex h-12 w-12 items-center justify-center border-r-[3px] border-[#0A0A0A] bg-white font-heading text-2xl font-bold cursor-pointer disabled:cursor-not-allowed disabled:bg-[#0A0A0A]/5 disabled:text-[#0A0A0A]/30"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10), min, max))}
        disabled={disabled}
        aria-label={ariaLabel}
        className="h-12 w-20 text-center font-heading text-2xl font-bold outline-none disabled:bg-[#0A0A0A]/5 disabled:text-[#0A0A0A]/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{ backgroundColor: disabled ? undefined : fillColor }}
      />
      <button
        type="button"
        onClick={() => bump(1)}
        disabled={disabled || value >= max}
        aria-label={`Increase ${ariaLabel}`}
        className="press flex h-12 w-12 items-center justify-center border-l-[3px] border-[#0A0A0A] bg-white font-heading text-2xl font-bold cursor-pointer disabled:cursor-not-allowed disabled:bg-[#0A0A0A]/5 disabled:text-[#0A0A0A]/30"
      >
        +
      </button>
    </div>
  );
}

interface RoomLobbyProps {
  code: string;
}

function RoomLobby({ code }: RoomLobbyProps) {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [ready, setReady] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [shareUrl, setShareUrl] = useState<string>("");

  const [localSettings, setLocalSettings] = useState<RoomSettings | null>(null);

  const isHost = useMemo(
    () => Boolean(roomState && userId && roomState.hostId === userId),
    [roomState, userId]
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
        setLoading(false);
        return;
      }
      const uid = seedData.user_id;
      setUserId(uid);

      const [getErr, getData] = await tryCatch(getRoom(code));
      if (cancelled) return;
      if (getErr) {
        if (getErr instanceof ApiError && getErr.status === 404) {
          setFatalError("Room not found.");
        } else {
          setFatalError("Could not load the room.");
        }
        setLoading(false);
        return;
      }

      let room = getData.room;
      const alreadyIn = room.players.some((p) => p.userId === uid);

      if (!alreadyIn) {
        const guestName = `Guest-${Math.floor(Math.random() * 90 + 10)}`;
        const [joinErr, joinData] = await tryCatch(
          joinRoom(code, guestName, uid)
        );
        if (cancelled) return;
        if (joinErr) {
          setFatalError(
            joinErr instanceof ApiError && joinErr.status === 404
              ? "Room not found."
              : "Could not join this room."
          );
          setLoading(false);
          return;
        }
        room = joinData.room;
      }

      setRoomState(room);
      setLocalSettings(room.settings);
      setLoading(false);

      // Subscribe to presence channel.
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
    };

    void init();

    return () => {
      cancelled = true;
      const ch = channelRef.current;
      if (ch) {
        ch.unbind_all();
        const pusher = getPusher();
        pusher.unsubscribe(`presence-room-${code}`);
        channelRef.current = null;
      }
    };
  }, [code, refetchRoom]);

  // Keep non-host's settings view in sync with server.
  useEffect(() => {
    if (!roomState) return;
    if (!isHost) {
      setLocalSettings(roomState.settings);
    }
  }, [roomState, isHost]);

  const settings: RoomSettings = localSettings ?? {
    gameMode: "showdown",
    rounds: 3,
    maxPlayers: 8,
    timer: 60,
    promptMaxLength: 200,
    category: "animals",
    difficulty: "normal",
  };

  const players: Player[] = roomState?.players ?? [];
  const allReady = players.length > 0 && players.every((p) => p.ready);
  const canStart = isHost && allReady && players.length >= 2;
  const roomFull = players.length >= settings.maxPlayers;

  const copy = async (text: string, setter: (v: boolean) => void): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 1500);
    } catch (err) {
      console.error("Clipboard failed:", err);
    }
  };

  const update = <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) => {
    if (!isHost) return;
    setLocalSettings((s) => ({ ...(s ?? settings), [key]: value }));
  };

  const handleStart = () => {
    if (!canStart) return;
    console.log("Start round (mock — start endpoint pending)", { code, settings });
  };

  const handleLeave = async () => {
    await tryCatch(leaveRoom(code));
    router.push("/");
  };

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-heading text-2xl">Loading room…</div>
      </main>
    );
  }

  if (fatalError || !roomState) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border-[3px] border-[#0A0A0A] bg-white p-8 text-center shadow-chunky-lg">
          <p className="font-heading text-2xl font-bold">{fatalError ?? "Something went wrong"}</p>
          <button
            onClick={() => router.push("/")}
            className="press mt-6 rounded-2xl border-[3px] border-[#0A0A0A] bg-[#22C55E] px-6 py-3 font-heading text-base font-bold uppercase tracking-wide shadow-chunky-sm cursor-pointer"
          >
            Back to start
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={handleLeave}
            className="press rounded-2xl border-[3px] border-[#0A0A0A] bg-white px-4 py-2 font-heading text-sm font-bold uppercase tracking-wide shadow-chunky-sm cursor-pointer"
          >
            ← Leave
          </button>
          <div className="font-heading text-xl">⛳️ PROMPT GOLF</div>
        </div>

        {/* Code + share */}
        <div className="mb-6 rounded-3xl border-[3px] border-[#0A0A0A] bg-white p-6 text-center shadow-chunky-lg">
          <p className="font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
            room code
          </p>
          <div className="mt-2 font-heading text-7xl font-bold tracking-[0.3em] sm:text-8xl">
            {code}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-center">
            <button
              onClick={() => copy(code, setCopiedCode)}
              className="press inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-[#0A0A0A] bg-[#FACC15] px-5 py-3 font-heading text-sm font-bold uppercase tracking-wide shadow-chunky-sm cursor-pointer sm:text-base"
              aria-label="Copy room code"
            >
              <CopyIcon done={copiedCode} />
              {copiedCode ? "Copied" : "Copy Code"}
            </button>
            <button
              onClick={() => copy(shareUrl, setCopiedLink)}
              className="press inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-[#0A0A0A] bg-[#38BDF8] px-5 py-3 font-heading text-sm font-bold uppercase tracking-wide shadow-chunky-sm cursor-pointer sm:text-base"
              aria-label="Copy share link"
            >
              <LinkIcon />
              {copiedLink ? "Copied" : "Copy Link"}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center">
            <div
              className="max-w-full truncate rounded-xl border-[3px] border-dashed border-[#0A0A0A]/40 bg-[#FFF8E7] px-3 py-2 font-mono text-xs text-[#0A0A0A]/70 sm:text-sm"
              title={shareUrl}
            >
              {shareUrl || "…"}
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="mb-6 rounded-3xl border-[3px] border-[#0A0A0A] bg-white p-6 shadow-chunky-lg">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
              Game Setup
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full border-[3px] border-[#0A0A0A] bg-[#22C55E] px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
                Showdown
              </span>
              {!isHost && (
                <span className="rounded-full border-[3px] border-[#0A0A0A] bg-[#FFF8E7] px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
                  Host controls
                </span>
              )}
            </div>
          </div>

          {/* Category */}
          <fieldset className="mb-6">
            <legend className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
              Category
            </legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const selected = settings.category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => update("category", c.id)}
                    disabled={!isHost}
                    aria-pressed={selected}
                    className={`press inline-flex items-center gap-2 rounded-full border-[3px] border-[#0A0A0A] px-4 py-2 font-heading text-sm font-bold uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed ${
                      selected ? "shadow-chunky-sm" : "bg-white opacity-70 hover:opacity-100"
                    }`}
                    style={selected ? { backgroundColor: c.color } : undefined}
                  >
                    <span aria-hidden="true">{c.emoji}</span>
                    <span>{c.label}</span>
                    {selected && <span aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <fieldset>
              <div className="mb-2 flex items-baseline justify-between">
                <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
                  Rounds
                </legend>
                <span className="font-heading text-xs text-[#0A0A0A]/50">
                  {MIN_ROUNDS}–{MAX_ROUNDS}
                </span>
              </div>
              <Stepper
                value={settings.rounds}
                min={MIN_ROUNDS}
                max={MAX_ROUNDS}
                ariaLabel="rounds"
                fillColor="#38BDF8"
                disabled={!isHost}
                onChange={(n) => update("rounds", n)}
              />
            </fieldset>

            <fieldset>
              <div className="mb-2 flex items-baseline justify-between">
                <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
                  Max players
                </legend>
                <span className="font-heading text-xs text-[#0A0A0A]/50">
                  {MIN_PLAYERS}–{MAX_PLAYERS}
                </span>
              </div>
              <Stepper
                value={settings.maxPlayers}
                min={MIN_PLAYERS}
                max={MAX_PLAYERS}
                ariaLabel="max players"
                fillColor="#22C55E"
                disabled={!isHost}
                onChange={(n) => update("maxPlayers", n)}
              />
            </fieldset>

            <fieldset>
              <div className="mb-2 flex items-baseline justify-between">
                <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
                  Round timer
                </legend>
                <span className="font-heading text-xs text-[#0A0A0A]/50">
                  {MIN_TIMER}–{MAX_TIMER}s
                </span>
              </div>
              <Stepper
                value={settings.timer}
                min={MIN_TIMER}
                max={MAX_TIMER}
                step={TIMER_STEP}
                ariaLabel="round timer in seconds"
                fillColor="#FACC15"
                disabled={!isHost}
                onChange={(n) => update("timer", n)}
              />
            </fieldset>

            <fieldset>
              <div className="mb-2 flex items-baseline justify-between">
                <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
                  Prompt cap
                </legend>
                <span className="font-heading text-xs text-[#0A0A0A]/50">
                  chars
                </span>
              </div>
              <div className="inline-flex rounded-2xl border-[3px] border-[#0A0A0A] bg-[#FFF8E7] p-1 shadow-chunky-sm">
                {PROMPT_LEN_OPTIONS.map((p) => {
                  const selected = settings.promptMaxLength === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => update("promptMaxLength", p)}
                      disabled={!isHost}
                      aria-pressed={selected}
                      className={`min-w-12 rounded-xl px-3 py-2 font-heading text-base font-bold cursor-pointer disabled:cursor-not-allowed ${
                        selected
                          ? "bg-[#F472B6] border-[3px] border-[#0A0A0A]"
                          : "border-[3px] border-transparent text-[#0A0A0A]/60 hover:text-[#0A0A0A]"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {/* Difficulty */}
          <fieldset className="mt-6">
            <legend className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
              Difficulty
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTIES.map((d) => {
                const selected = settings.difficulty === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => update("difficulty", d.id)}
                    disabled={!isHost}
                    aria-pressed={selected}
                    className={`press rounded-2xl border-[3px] border-[#0A0A0A] p-3 text-left transition cursor-pointer disabled:cursor-not-allowed ${
                      selected ? "shadow-chunky-sm" : "bg-white opacity-70 hover:opacity-100"
                    }`}
                    style={selected ? { backgroundColor: d.color } : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-heading text-base font-bold uppercase tracking-wide">
                        {d.label}
                      </div>
                      {selected && (
                        <span className="rounded-full border-2 border-[#0A0A0A] bg-white px-1.5 py-0 font-heading text-[9px] font-bold uppercase tracking-wide">
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-sans text-xs leading-snug text-[#0A0A0A]/70">
                      {d.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {/* Players */}
        <div className="mb-6 rounded-3xl border-[3px] border-[#0A0A0A] bg-white p-6 shadow-chunky-lg">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
              Players
            </h2>
            <span className="font-heading text-sm font-semibold text-[#0A0A0A]/60">
              {players.length} / {settings.maxPlayers}
              {roomFull && (
                <span className="ml-2 rounded-full border-2 border-[#0A0A0A] bg-[#F472B6] px-2 py-0.5 text-[10px] uppercase">
                  Full
                </span>
              )}
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {players.map((p) => {
              const isYou = p.userId === userId;
              const isPlayerHost = p.userId === roomState.hostId;
              return (
                <li
                  key={p.userId}
                  className={`relative rounded-2xl border-[3px] border-[#0A0A0A] p-3 shadow-chunky-sm ${
                    p.ready ? "bg-[#bbf7d0]" : "bg-[#FFF8E7]"
                  } ${!p.connected ? "opacity-60" : ""}`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-16 w-16 overflow-hidden rounded-full border-[3px] border-[#0A0A0A] bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarUrl(p.avatarSeed || p.userId)}
                        alt={`${p.name} avatar`}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="w-full truncate text-center font-heading text-sm font-bold">
                      {p.name}
                      {isYou && <span className="ml-1 text-[#0A0A0A]/50">(you)</span>}
                    </div>
                    <div className="flex h-5 flex-wrap items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                      {isPlayerHost && (
                        <span className="rounded-full border-2 border-[#0A0A0A] bg-[#FACC15] px-2 py-0.5">
                          Host
                        </span>
                      )}
                      {p.role === "spectator" && (
                        <span className="rounded-full border-2 border-[#0A0A0A] bg-[#38BDF8] px-2 py-0.5">
                          Spec
                        </span>
                      )}
                      {p.ready ? (
                        <span className="rounded-full border-2 border-[#0A0A0A] bg-[#22C55E] px-2 py-0.5">
                          Ready
                        </span>
                      ) : (
                        <span className="rounded-full border-2 border-[#0A0A0A] bg-white px-2 py-0.5 text-[#0A0A0A]/60">
                          Waiting
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3">
          {!isHost && (
            <button
              onClick={() => setReady((r) => !r)}
              className={`press rounded-2xl border-[3px] border-[#0A0A0A] py-5 font-heading text-2xl font-bold uppercase tracking-wide shadow-chunky cursor-pointer ${
                ready ? "bg-[#22C55E]" : "bg-[#FACC15]"
              }`}
            >
              {ready ? "✓ Ready" : "Tap to Ready Up"}
            </button>
          )}
          {isHost && (
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="press rounded-2xl border-[3px] border-[#0A0A0A] bg-[#22C55E] py-5 font-heading text-2xl font-bold uppercase tracking-wide shadow-chunky cursor-pointer disabled:cursor-not-allowed disabled:bg-[#0A0A0A]/10 disabled:text-[#0A0A0A]/40 disabled:shadow-chunky-sm"
            >
              {players.length < 2
                ? "Waiting for players…"
                : !allReady
                ? "Waiting on ready up…"
                : "Start Round"}
            </button>
          )}
          <p className="text-center font-heading text-xs text-[#0A0A0A]/50">
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
