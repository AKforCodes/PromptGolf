"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

interface Player {
  id: string;
  name: string;
  ready: boolean;
  isHost: boolean;
  isYou: boolean;
}

type GameMode = "showdown" | "holeinone" | "whisper";
type Category = "landmark" | "food" | "nature" | "characters";
type MaxPlayers = 4 | 6 | 8;

interface RoomSettings {
  mode: GameMode;
  categories: Category[];
  maxPlayers: MaxPlayers;
}

const MOCK_REMOTE_PLAYERS: Omit<Player, "isYou">[] = [
  { id: "p2", name: "Sammy", ready: true, isHost: false },
  { id: "p3", name: "Lola", ready: false, isHost: false },
  { id: "p4", name: "Pip", ready: true, isHost: false },
];

const MODES: { id: GameMode; label: string; desc: string; available: boolean }[] = [
  { id: "showdown", label: "Showdown", desc: "All players race. Fewest chars wins.", available: true },
  { id: "holeinone", label: "Hole In One", desc: "Solo daily challenge.", available: false },
  { id: "whisper", label: "Whisper", desc: "Telephone with prompts.", available: false },
];

const CATEGORIES: { id: Category; label: string; emoji: string; color: string }[] = [
  { id: "landmark", label: "Landmarks", emoji: "🗽", color: "#38BDF8" },
  { id: "food", label: "Food", emoji: "🍕", color: "#F472B6" },
  { id: "nature", label: "Nature", emoji: "🌲", color: "#22C55E" },
  { id: "characters", label: "Characters", emoji: "🦸", color: "#FACC15" },
];

const MAX_PLAYER_OPTIONS: MaxPlayers[] = [4, 6, 8];

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

function RoomLobby({ code }: { code: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const isHost = search.get("host") === "1";
  const myName = search.get("name") || "Guest-01";

  const [ready, setReady] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [shareUrl, setShareUrl] = useState<string>("");

  const [settings, setSettings] = useState<RoomSettings>({
    mode: "showdown",
    categories: ["landmark", "nature", "characters"],
    maxPlayers: 6,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/room/${code}`);
    }
  }, [code]);

  const me: Player = useMemo(
    () => ({
      id: "you",
      name: myName,
      ready: isHost ? true : ready,
      isHost,
      isYou: true,
    }),
    [myName, isHost, ready]
  );

  const players: Player[] = useMemo(() => {
    const remotes = MOCK_REMOTE_PLAYERS.map((p) => ({ ...p, isYou: false }));
    if (isHost) {
      return [me, ...remotes];
    }
    const host: Player = {
      id: "p1",
      name: "Akin",
      ready: true,
      isHost: true,
      isYou: false,
    };
    return [host, ...remotes, me];
  }, [me, isHost]);

  const allReady = players.every((p) => p.ready);
  const hasCategory = settings.categories.length > 0;
  const canStart = isHost && allReady && players.length >= 2 && hasCategory;
  const roomFull = players.length >= settings.maxPlayers;

  const copy = async (
    text: string,
    setter: (v: boolean) => void
  ): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 1500);
    } catch (err) {
      console.error("Clipboard failed:", err);
    }
  };

  const handleStart = () => {
    if (!canStart) return;
    console.log("Start round (mock)", { code, settings });
  };

  const handleLeave = () => {
    router.push("/");
  };

  const toggleCategory = (cat: Category) => {
    if (!isHost) return;
    setSettings((s) => {
      const has = s.categories.includes(cat);
      const next = has
        ? s.categories.filter((c) => c !== cat)
        : [...s.categories, cat];
      return { ...s, categories: next };
    });
  };

  const setMode = (mode: GameMode) => {
    if (!isHost) return;
    const target = MODES.find((m) => m.id === mode);
    if (!target?.available) return;
    setSettings((s) => ({ ...s, mode }));
  };

  const setMaxPlayers = (n: MaxPlayers) => {
    if (!isHost) return;
    setSettings((s) => ({ ...s, maxPlayers: n }));
  };

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
            {!isHost && (
              <span className="rounded-full border-[3px] border-[#0A0A0A] bg-[#FFF8E7] px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
                Host controls
              </span>
            )}
          </div>

          {/* Mode */}
          <fieldset className="mb-6">
            <legend className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
              Game mode
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {MODES.map((m) => {
                const selected = settings.mode === m.id;
                const disabled = !m.available || !isHost;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    disabled={disabled}
                    aria-pressed={selected}
                    className={`press rounded-2xl border-[3px] border-[#0A0A0A] p-3 text-left transition cursor-pointer disabled:cursor-not-allowed ${
                      selected
                        ? "bg-[#22C55E] shadow-chunky-sm"
                        : m.available
                        ? "bg-[#FFF8E7] shadow-chunky-sm hover:bg-[#FACC15]/40"
                        : "bg-[#0A0A0A]/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-heading text-base font-bold">
                        {m.label}
                      </div>
                      {!m.available && (
                        <span className="rounded-full border-2 border-[#0A0A0A] bg-white px-1.5 py-0 font-heading text-[9px] font-bold uppercase tracking-wide">
                          Soon
                        </span>
                      )}
                      {selected && m.available && (
                        <span className="rounded-full border-2 border-[#0A0A0A] bg-white px-1.5 py-0 font-heading text-[9px] font-bold uppercase tracking-wide">
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-sans text-xs leading-snug text-[#0A0A0A]/70">
                      {m.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Categories */}
          <fieldset className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
                Categories
              </legend>
              <span className="font-heading text-xs text-[#0A0A0A]/50">
                pick at least 1
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const selected = settings.categories.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.id)}
                    disabled={!isHost}
                    aria-pressed={selected}
                    className={`press inline-flex items-center gap-2 rounded-full border-[3px] border-[#0A0A0A] px-4 py-2 font-heading text-sm font-bold uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed ${
                      selected
                        ? "shadow-chunky-sm"
                        : "bg-white opacity-70 hover:opacity-100"
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
            {!hasCategory && (
              <p
                role="alert"
                className="mt-2 font-heading text-xs font-semibold text-[#dc2626]"
              >
                pick at least one category to start
              </p>
            )}
          </fieldset>

          {/* Max players */}
          <fieldset>
            <legend className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
              Max players
            </legend>
            <div className="inline-flex rounded-2xl border-[3px] border-[#0A0A0A] bg-[#FFF8E7] p-1 shadow-chunky-sm">
              {MAX_PLAYER_OPTIONS.map((n) => {
                const selected = settings.maxPlayers === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxPlayers(n)}
                    disabled={!isHost}
                    aria-pressed={selected}
                    className={`min-w-14 rounded-xl px-4 py-2 font-heading text-base font-bold transition cursor-pointer disabled:cursor-not-allowed ${
                      selected
                        ? "bg-[#22C55E] border-[3px] border-[#0A0A0A]"
                        : "border-[3px] border-transparent text-[#0A0A0A]/60 hover:text-[#0A0A0A]"
                    }`}
                  >
                    {n}
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
            {players.map((p) => (
              <li
                key={p.id}
                className={`relative rounded-2xl border-[3px] border-[#0A0A0A] p-3 shadow-chunky-sm ${
                  p.ready ? "bg-[#bbf7d0]" : "bg-[#FFF8E7]"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="h-16 w-16 overflow-hidden rounded-full border-[3px] border-[#0A0A0A] bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarUrl(p.id + p.name)}
                      alt={`${p.name} avatar`}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="w-full truncate text-center font-heading text-sm font-bold">
                    {p.name}
                    {p.isYou && (
                      <span className="ml-1 text-[#0A0A0A]/50">(you)</span>
                    )}
                  </div>
                  <div className="flex h-5 items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                    {p.isHost && (
                      <span className="rounded-full border-2 border-[#0A0A0A] bg-[#FACC15] px-2 py-0.5">
                        Host
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
            ))}
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
              {!hasCategory
                ? "Pick a category…"
                : players.length < 2
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
