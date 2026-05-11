"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { tryCatch } from "@/lib/result";
import {
  ApiError,
  createRoom,
  joinRoom,
  seedUser,
  DEFAULT_ROOM_SETTINGS,
} from "@/lib/api";
import { randomGuestName } from "@/lib/guest-name";
import {
  packAvatarSeed,
  type AvatarOptions,
  type AvatarStyle,
} from "@/lib/avatar";
import { Avatar } from "@/components/jklm/avatar";
import { AvatarEditor } from "@/components/jklm/avatar-editor";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { Wordmark } from "@/components/jklm/wordmark";
import { GolfMascot } from "@/components/jklm/golf-mascot";

type Tab = "create" | "join";

const NAME_MAX = 16;
const CODE_LEN = 4;

const FLOAT_GLYPHS = ["⛳", "🏌️", "🟢", "🎯", "✨", "🏆"];

interface Step {
  num: string;
  emoji: string;
  title: string;
  desc: string;
  bg: string;
}

const STEPS: Step[] = [
  {
    num: "01",
    emoji: "👁",
    title: "Memorize",
    desc: "study the target image",
    bg: "bg-sky",
  },
  {
    num: "02",
    emoji: "✍",
    title: "Prompt",
    desc: "race to recreate it",
    bg: "bg-sun",
  },
  {
    num: "03",
    emoji: "🏆",
    title: "Vote",
    desc: "closest shot wins",
    bg: "bg-pink",
  },
];

export default function Home() {
  const router = useRouter();
  const reduce = useReducedMotion();

  const [name, setName] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [avatarSeed, setAvatarSeed] = useState<string>("");
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("fun-emoji");
  const [avatarOptions, setAvatarOptions] = useState<AvatarOptions>({});
  const [tab, setTab] = useState<Tab>("create");
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guest name + avatar seed are browser-only random; lazy init would cause hydration mismatch
    setName(randomGuestName());
    setAvatarSeed(crypto.randomUUID());
    const seed = async () => {
      const [err, data] = await tryCatch(seedUser());
      if (err) {
        console.error("Failed to seed user:", err);
        return;
      }
      setUserId(data.user_id);
    };
    void seed();
  }, []);

  const ensureUserId = async (): Promise<string | null> => {
    if (userId) return userId;
    const [err, data] = await tryCatch(seedUser());
    if (err) {
      setError("Could not start a session. Try again.");
      return null;
    }
    setUserId(data.user_id);
    return data.user_id;
  };

  const handleCreate = async () => {
    if (busy) return;
    if (!name.trim()) {
      setError("Pick a name first");
      return;
    }
    setError(null);
    setBusy(true);

    const haveSession = await ensureUserId();
    if (!haveSession) {
      setBusy(false);
      return;
    }

    const packedSeed = packAvatarSeed(avatarSeed, avatarStyle, avatarOptions);
    const [err, data] = await tryCatch(
      createRoom(name.trim(), packedSeed, DEFAULT_ROOM_SETTINGS),
    );
    if (err) {
      setError(
        err instanceof ApiError ? `Couldn't create room (${err.status})` : "Network error",
      );
      setBusy(false);
      return;
    }

    router.push(`/room/${data.room.code}`);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length !== CODE_LEN) {
      setError(`Room code is ${CODE_LEN} letters`);
      return;
    }
    if (!name.trim()) {
      setError("Pick a name first");
      return;
    }
    setError(null);
    setBusy(true);

    const haveSession = await ensureUserId();
    if (!haveSession) {
      setBusy(false);
      return;
    }

    const packedSeed = packAvatarSeed(avatarSeed, avatarStyle, avatarOptions);
    const [err] = await tryCatch(joinRoom(cleaned, name.trim(), packedSeed));
    if (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Room not found");
      } else if (err instanceof ApiError) {
        setError(`Couldn't join (${err.status})`);
      } else {
        setError("Network error");
      }
      setBusy(false);
      return;
    }

    router.push(`/room/${cleaned}`);
  };

  const reshuffleAvatar = () => {
    setAvatarSeed(crypto.randomUUID());
  };

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-4 py-6">
      {/* Layered background: radial spotlights */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(34,197,94,0.22), transparent 55%), radial-gradient(ellipse at bottom right, rgba(250,204,21,0.18), transparent 55%), radial-gradient(ellipse at bottom left, rgba(244,114,182,0.14), transparent 55%)",
        }}
      />

      {/* Halftone dot texture */}
      <div
        aria-hidden="true"
        className="halftone pointer-events-none absolute inset-0 opacity-60"
      />

      {/* Floating glyphs */}
      {!reduce && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {FLOAT_GLYPHS.map((glyph, i) => (
            <motion.span
              key={i}
              className="absolute select-none text-5xl opacity-[0.10] sm:text-7xl"
              style={{
                left: `${(i * 17 + 5) % 90}%`,
                top: `${(i * 31 + 8) % 90}%`,
              }}
              initial={{ y: 0, rotate: 0 }}
              animate={{
                y: [0, -16, 0],
                rotate: [0, i % 2 === 0 ? 14 : -14, 0],
              }}
              transition={{
                duration: 9 + (i % 3),
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.6,
              }}
            >
              {glyph}
            </motion.span>
          ))}
        </div>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col">
        {/* Top utility bar */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <span className="rounded-full border-[3px] border-ink bg-white px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wide shadow-chunky-sm">
            ⚡ Hackathon Build
          </span>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/AKforCodes/PromptGolf"
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex items-center gap-1.5 rounded-full border-[3px] border-ink bg-white px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wide shadow-chunky-sm cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.6.5.5 5.6.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.4-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.3 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2.9-.3 2-.4 3-.4s2.1.1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.6 18.4.5 12 .5z" />
              </svg>
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </div>

        {/* HERO: 3-zone grid on lg+, stacked on mobile */}
        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
          {/* ZONE 1 — Identity */}
          <motion.section
            initial={reduce ? false : { x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}
            className="lg:col-span-3"
          >
            <Card className="flex h-full flex-col items-center p-5 text-center">
              <span className="mb-2 self-start rounded-full border-2 border-ink bg-sky px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
                You
              </span>

              {/* Big avatar tile with reroll FAB */}
              <div className="relative mb-3">
                <motion.div
                  key={`${avatarStyle}:${avatarSeed}`}
                  initial={
                    reduce ? false : { scale: 0.7, rotate: -10, opacity: 0 }
                  }
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 360,
                    damping: 20,
                  }}
                >
                  {avatarSeed && (
                    <Avatar
                      seed={packAvatarSeed(avatarSeed, avatarStyle, avatarOptions)}
                      name={name}
                      size="xl"
                      bounce="none"
                    />
                  )}
                </motion.div>
                <button
                  type="button"
                  onClick={reshuffleAvatar}
                  disabled={busy}
                  aria-label="Reroll seed"
                  title="Reroll the random seed"
                  className="press absolute -bottom-1 -right-1 inline-flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-ink bg-sun font-heading text-base shadow-chunky-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  🎲
                </button>
              </div>

              {/* Editor — style + trait arrows + bg swatches */}
              <div className="mb-3 w-full">
                <AvatarEditor
                  style={avatarStyle}
                  options={avatarOptions}
                  disabled={busy}
                  onStyleChange={(s) => {
                    setAvatarStyle(s);
                    // Trait keys differ per style — drop trait options on switch,
                    // keep bg color if user picked one.
                    setAvatarOptions((cur) => {
                      const next: AvatarOptions = {};
                      if (cur.backgroundColor) next.backgroundColor = cur.backgroundColor;
                      return next;
                    });
                  }}
                  onOptionsChange={setAvatarOptions}
                />
              </div>

              {/* Name input */}
              <label className="mb-1 self-start font-heading text-[10px] font-bold uppercase tracking-wide text-ink/55">
                your name
              </label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value.slice(0, NAME_MAX));
                  setError(null);
                }}
                maxLength={NAME_MAX}
                disabled={busy}
                className="w-full rounded-2xl border-[3px] border-ink bg-cream px-4 py-3 text-center font-heading text-xl font-bold outline-none transition focus:bg-white focus:shadow-chunky-sm disabled:opacity-60"
                placeholder="Guest-01"
                aria-label="Player name"
              />
              <p className="mt-2 font-heading text-[10px] uppercase tracking-wide text-ink/40">
                cookie-only · no signup
              </p>
            </Card>
          </motion.section>

          {/* ZONE 2 — Action */}
          <motion.section
            initial={reduce ? false : { y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 240,
              damping: 24,
              delay: 0.05,
            }}
            className="lg:col-span-6"
          >
            <Card className="flex h-full flex-col p-6">
              {/* Wordmark + mascot */}
              <div className="mb-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-5">
                <Wordmark size="md" />
                <GolfMascot size={88} />
              </div>

              <p className="mb-4 text-center font-heading text-sm font-semibold uppercase tracking-wide text-ink/55">
                shortest prompt · sharpest shot · wins
              </p>

              {/* Tabs */}
              <div
                role="tablist"
                aria-label="Play options"
                className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border-[3px] border-ink bg-cream p-1"
              >
                <button
                  role="tab"
                  type="button"
                  aria-selected={tab === "create"}
                  onClick={() => {
                    setTab("create");
                    setError(null);
                  }}
                  className={`press rounded-xl border-2 border-ink py-2 font-heading text-sm font-extrabold uppercase tracking-wide cursor-pointer transition ${
                    tab === "create"
                      ? "bg-golf shadow-chunky-sm"
                      : "bg-transparent border-transparent"
                  }`}
                >
                  ⛳ Create
                </button>
                <button
                  role="tab"
                  type="button"
                  aria-selected={tab === "join"}
                  onClick={() => {
                    setTab("join");
                    setError(null);
                  }}
                  className={`press rounded-xl border-2 border-ink py-2 font-heading text-sm font-extrabold uppercase tracking-wide cursor-pointer transition ${
                    tab === "join"
                      ? "bg-sun shadow-chunky-sm"
                      : "bg-transparent border-transparent"
                  }`}
                >
                  🎯 Join
                </button>
              </div>

              {/* Tab content */}
              <AnimatePresence mode="wait">
                {tab === "create" ? (
                  <motion.div
                    key="create"
                    initial={reduce ? false : { x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={reduce ? undefined : { x: 10, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col gap-3"
                  >
                    <div className="rounded-2xl border-[3px] border-dashed border-ink/30 bg-cream/60 p-4 text-center">
                      <p className="font-heading text-sm font-bold uppercase tracking-wide text-ink/70">
                        Host a fresh round
                      </p>
                      <p className="mt-1 font-heading text-xs text-ink/45">
                        you&apos;ll get a 4-letter code to share
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="lg"
                      full
                      onClick={handleCreate}
                      disabled={busy}
                    >
                      {busy ? "Creating…" : "⛳ Tee Off"}
                    </Button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="join"
                    onSubmit={handleJoinSubmit}
                    initial={reduce ? false : { x: 10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={reduce ? undefined : { x: -10, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col gap-3"
                  >
                    <label className="font-heading text-[11px] font-bold uppercase tracking-wide text-ink/55">
                      room code
                    </label>
                    <input
                      value={code}
                      onChange={(e) => {
                        setCode(
                          e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, CODE_LEN),
                        );
                        setError(null);
                      }}
                      autoFocus
                      maxLength={CODE_LEN}
                      inputMode="text"
                      autoCapitalize="characters"
                      spellCheck={false}
                      disabled={busy}
                      className="w-full rounded-2xl border-[3px] border-ink bg-cream px-5 py-4 text-center font-heading text-4xl font-extrabold uppercase tracking-[0.5em] outline-none transition focus:bg-white focus:shadow-chunky-sm disabled:opacity-60"
                      placeholder="ABCD"
                      aria-label="Room code"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      full
                      disabled={busy}
                    >
                      {busy ? "Joining…" : "Enter Room"}
                    </Button>
                  </motion.form>
                )}
              </AnimatePresence>

              {error && (
                <motion.p
                  role="alert"
                  initial={reduce ? false : { y: -6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="mt-4 rounded-xl border-[3px] border-ink bg-pink px-4 py-2 text-center font-heading text-sm font-semibold"
                >
                  {error}
                </motion.p>
              )}
            </Card>
          </motion.section>

          {/* ZONE 3 — How to play */}
          <motion.section
            initial={reduce ? false : { x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 240,
              damping: 24,
              delay: 0.1,
            }}
            className="lg:col-span-3"
          >
            <Card className="flex h-full flex-col p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="rounded-full border-2 border-ink bg-pink px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
                  ★ How to play
                </span>
              </div>

              <ol className="flex flex-1 flex-col gap-3">
                {STEPS.map((step, i) => (
                  <motion.li
                    key={step.title}
                    initial={
                      reduce ? false : { y: 10, opacity: 0 }
                    }
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 280,
                      damping: 22,
                      delay: 0.2 + i * 0.08,
                    }}
                    className={`flex items-center gap-3 rounded-2xl border-[3px] border-ink ${step.bg} p-3 shadow-chunky-sm`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-ink bg-white font-heading text-lg">
                      {step.emoji}
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <span className="block font-heading text-[10px] font-extrabold uppercase tracking-wide text-ink/55 tabular-nums">
                        Step {step.num}
                      </span>
                      <span className="block font-heading text-base font-extrabold uppercase tracking-tight">
                        {step.title}
                      </span>
                      <span className="block font-heading text-[11px] text-ink/65">
                        {step.desc}
                      </span>
                    </div>
                  </motion.li>
                ))}
              </ol>

              <p className="mt-3 text-center font-heading text-[10px] uppercase tracking-wide text-ink/45">
                3–8 players · ~5 min per game
              </p>
            </Card>
          </motion.section>
        </div>

        {/* Bottom utility bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[3px] border-ink bg-white/70 px-4 py-2 shadow-chunky-sm backdrop-blur">
          <div className="flex items-center gap-2 font-heading text-[10px] font-bold uppercase tracking-wide text-ink/55">
            <span>tap fast</span>
            <span aria-hidden="true">·</span>
            <span>think short</span>
            <span aria-hidden="true">·</span>
            <span>win big</span>
          </div>
          <div className="flex items-center gap-2 font-heading text-[10px] font-bold uppercase tracking-wide text-ink/45">
            <span>Built for hackathon</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">FLUX · Pusher · Upstash</span>
          </div>
        </div>
      </div>
    </main>
  );
}
