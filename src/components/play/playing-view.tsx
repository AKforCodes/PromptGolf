"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Attempt, Player, RoomState } from "@/lib/types";
import {
  ApiError,
  getRoundDetails,
  submitGeneration,
} from "@/lib/api";
import { tryCatch } from "@/lib/result";
import { getPusher } from "@/lib/pusher-client";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { findCategory } from "@/lib/room-constants";
import { avatarUrl } from "@/lib/avatar";
import { usePhaseCountdown } from "./use-phase-countdown";

interface PlayingViewProps {
  code: string;
  roomState: RoomState;
  userId: string;
  onLeave: () => void;
}

const AMBIENT_GLYPHS = ["⛳️", "🏌️", "🟢", "⛳️", "🏌️"];

export function PlayingView({
  code,
  roomState,
  userId,
  onLeave,
}: PlayingViewProps) {
  const {
    settings,
    currentRound,
    players,
    targetImageUrl,
    hostId,
    phaseEndsAt,
  } = roomState;

  const isHost = userId === hostId;
  const nonHostPlayers = players.filter((p) => p.userId !== hostId);
  const meAsNonHost = nonHostPlayers.find((p) => p.userId === userId);
  const isPrompter = !isHost && meAsNonHost?.role === "prompter";
  const isSpectator = !isHost && meAsNonHost?.role === "spectator";

  const totalSecondsLeft = usePhaseCountdown(phaseEndsAt);
  const inMemorize = totalSecondsLeft > settings.timer;
  const secondsLeft = inMemorize
    ? Math.max(0, totalSecondsLeft - settings.timer)
    : totalSecondsLeft;
  const phaseTotal = inMemorize ? settings.memorizeTime : settings.timer;
  const barPct = phaseTotal > 0 ? (secondsLeft / phaseTotal) * 100 : 0;
  const barColor = inMemorize ? "bg-sky" : "bg-golf";
  const timeOut = !inMemorize && totalSecondsLeft === 0;
  const urgent = !inMemorize && secondsLeft <= 5 && secondsLeft > 0;

  const [prompt, setPrompt] = useState<string>("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionCounts, setSubmissionCounts] = useState<
    Record<string, number>
  >({});

  const reduce = useReducedMotion();

  useEffect(() => {
    if (currentRound < 1) return;
    let cancelled = false;
    void (async () => {
      const [err, data] = await tryCatch(getRoundDetails(code, currentRound));
      if (cancelled) return;
      if (err) {
        console.error("getRoundDetails failed:", err);
        return;
      }
      setAttempts(data.myAttempts);
      setSubmissionCounts((prev) => ({
        ...prev,
        [userId]: data.myAttempts.length,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [code, currentRound, userId]);

  useEffect(() => {
    if (currentRound < 1) return;
    const pusher = getPusher();
    const channelName = `presence-room-${code}`;
    const channel = pusher.subscribe(channelName);

    const onAttempt = (a: Attempt) => {
      setSubmissionCounts((prev) => ({
        ...prev,
        [a.userId]: (prev[a.userId] ?? 0) + 1,
      }));
      if (a.userId === userId) {
        setAttempts((prev) =>
          prev.some((x) => x.id === a.id) ? prev : [...prev, a]
        );
      }
    };

    channel.bind("attempt-submitted", onAttempt);
    return () => {
      channel.unbind("attempt-submitted", onAttempt);
    };
  }, [code, currentRound, userId]);

  const usedAttempts = attempts.length;
  const remainingAttempts = Math.max(
    0,
    settings.attemptsPerRound - usedAttempts
  );

  const category = findCategory(settings.category);
  const charCount = prompt.length;
  const charPct = Math.min(100, (charCount / settings.promptMaxLength) * 100);
  const overCap = charCount > settings.promptMaxLength;
  const charBarColor = overCap
    ? "bg-pink"
    : charPct > 80
    ? "bg-sun"
    : "bg-golf";
  const canSubmit =
    !inMemorize &&
    !timeOut &&
    !submitting &&
    !overCap &&
    remainingAttempts > 0 &&
    prompt.trim().length > 0 &&
    !isSpectator;

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canSubmit) return;
      setSubmitError(null);
      setSubmitting(true);
      const [err, data] = await tryCatch(submitGeneration(code, prompt.trim()));
      setSubmitting(false);
      if (err) {
        setSubmitError(
          err instanceof ApiError ? err.message : "Submission failed"
        );
        return;
      }
      setAttempts((prev) =>
        prev.some((x) => x.id === data.attempt.id)
          ? prev
          : [...prev, data.attempt]
      );
      setPrompt("");
    },
    [canSubmit, code, prompt]
  );

  const submittedPlayers = useMemo<Player[]>(
    () => nonHostPlayers.filter((p) => p.role === "prompter"),
    [nonHostPlayers]
  );

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-cream px-4 py-6">
      {!reduce && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {AMBIENT_GLYPHS.map((glyph, i) => (
            <motion.span
              key={i}
              className="absolute select-none text-5xl opacity-20 sm:text-6xl"
              initial={{
                x: `${(i * 23) % 100}%`,
                y: `${(i * 37) % 100}%`,
              }}
              animate={{
                y: [
                  `${(i * 37) % 100}%`,
                  `${((i * 37) % 100) - 10}%`,
                  `${(i * 37) % 100}%`,
                ],
                rotate: [0, i % 2 === 0 ? 10 : -10, 0],
              }}
              transition={{
                duration: 7 + (i % 3),
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.5,
              }}
            >
              {glyph}
            </motion.span>
          ))}
        </div>
      )}

      <div className="relative mx-auto w-full max-w-4xl">
        {/* Top bar: leave button + round + category */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="neutral" size="sm" onClick={onLeave}>
            ← Leave
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border-[3px] border-ink bg-golf px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide shadow-chunky-sm">
              Round {currentRound} / {settings.rounds}
            </span>
            {category && (
              <span
                className="rounded-full border-[3px] border-ink px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide shadow-chunky-sm"
                style={{ backgroundColor: category.color }}
              >
                <span aria-hidden="true">{category.emoji}</span>{" "}
                {category.label}
              </span>
            )}
          </div>
        </div>

        {/* Combined phase HUD: phase pill + big timer + animated progress */}
        <div className="mb-4 rounded-3xl border-[3px] border-ink bg-white p-4 shadow-chunky">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <motion.span
                key={inMemorize ? "memorize" : "prompt"}
                initial={reduce ? false : { scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 360, damping: 18 }}
                className={`rounded-full border-[3px] border-ink px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide shadow-chunky-sm ${
                  inMemorize ? "bg-sky" : "bg-sun"
                }`}
              >
                {inMemorize ? "👁  Memorize" : "✍  Prompt"}
              </motion.span>
              <span className="hidden font-heading text-xs font-semibold uppercase tracking-wide text-ink/50 sm:inline">
                {inMemorize
                  ? "study the target"
                  : isSpectator
                  ? "spectating"
                  : "type your best shot"}
              </span>
            </div>

            <motion.div
              animate={
                urgent && !reduce
                  ? { scale: [1, 1.08, 1] }
                  : { scale: 1 }
              }
              transition={{ duration: 0.6, repeat: urgent ? Infinity : 0 }}
              className={`font-heading text-4xl font-bold tabular-nums sm:text-5xl ${
                urgent
                  ? "text-pink"
                  : timeOut
                  ? "text-ink/40"
                  : "text-ink"
              }`}
              aria-live="polite"
            >
              {secondsLeft}
              <span className="ml-0.5 text-base text-ink/50 sm:text-lg">s</span>
            </motion.div>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full border-[3px] border-ink bg-cream"
            aria-hidden="true"
          >
            <motion.div
              initial={false}
              animate={{ width: `${barPct}%` }}
              transition={{ ease: "linear", duration: 0.25 }}
              className={`h-full ${barColor}`}
            />
          </div>
        </div>

        {/* Phase body */}
        <AnimatePresence mode="wait">
          {inMemorize ? (
            <motion.div
              key="memorize"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="flex flex-col">
                <div className="mb-3 text-center">
                  <h2 className="font-heading text-2xl font-bold uppercase tracking-tight">
                    Memorize the image
                  </h2>
                  <p className="mt-1 font-heading text-xs text-ink/50">
                    it disappears when the timer runs out
                  </p>
                </div>
                <div className="relative mx-auto w-full max-w-xl">
                  <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-[3px] border-ink bg-cream shadow-chunky">
                    {targetImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={targetImageUrl}
                        alt="Target image"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-center">
                        <div>
                          <motion.div
                            animate={
                              reduce ? undefined : { rotate: [0, -8, 8, 0] }
                            }
                            transition={{
                              duration: 1.6,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }}
                            className="text-6xl"
                            aria-hidden="true"
                          >
                            🎨
                          </motion.div>
                          <p className="mt-3 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
                            target image loading…
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Floating MEMORIZE badge */}
                  <motion.div
                    initial={reduce ? false : { y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 18,
                      delay: 0.1,
                    }}
                    className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border-[3px] border-ink bg-sky px-4 py-1 font-heading text-xs font-bold uppercase tracking-wide shadow-chunky-sm"
                  >
                    👁 study it
                  </motion.div>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="prompt"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <Card>
                <form onSubmit={handleSubmit} className="flex h-full flex-col">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="font-heading text-xl font-bold uppercase tracking-wide">
                      Your Prompt
                    </h2>
                    <span className="rounded-full border-2 border-ink bg-cream px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
                      {remainingAttempts} / {settings.attemptsPerRound} left
                    </span>
                  </div>

                  {isSpectator ? (
                    <div className="flex flex-1 items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/40 bg-cream p-8 text-center">
                      <div>
                        <div className="text-4xl" aria-hidden="true">
                          👀
                        </div>
                        <p className="mt-2 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
                          spectating
                        </p>
                        <p className="mt-1 font-heading text-xs text-ink/40">
                          room is at capacity
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <textarea
                          value={prompt}
                          onChange={(e) => {
                            setPrompt(e.target.value);
                            if (submitError) setSubmitError(null);
                          }}
                          disabled={
                            submitting || timeOut || remainingAttempts === 0
                          }
                          placeholder={
                            remainingAttempts === 0
                              ? "no attempts remaining"
                              : "e.g. fox in the snow"
                          }
                          aria-label="Your prompt"
                          maxLength={settings.promptMaxLength + 50}
                          className="min-h-32 w-full resize-none rounded-2xl border-[3px] border-ink bg-cream px-5 py-4 pr-20 font-heading text-2xl outline-none transition focus:bg-white focus:shadow-chunky-sm disabled:opacity-60"
                          autoFocus
                        />
                        <span
                          className={`pointer-events-none absolute right-3 top-3 rounded-full border-2 border-ink px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums ${
                            overCap
                              ? "bg-pink text-ink"
                              : charPct > 80
                              ? "bg-sun"
                              : "bg-white"
                          }`}
                        >
                          {charCount}/{settings.promptMaxLength}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2 font-heading text-xs">
                        <span
                          className={
                            overCap
                              ? "font-bold text-pink"
                              : "text-ink/60"
                          }
                        >
                          {overCap
                            ? `${charCount - settings.promptMaxLength} over cap`
                            : `${settings.promptMaxLength - charCount} chars left`}
                        </span>
                        <div className="flex items-center gap-2">
                          {timeOut && (
                            <span className="rounded-full border-2 border-ink bg-pink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                              Time up
                            </span>
                          )}
                          {remainingAttempts === 0 && !timeOut && (
                            <span className="rounded-full border-2 border-ink bg-sun px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                              Cap reached
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full border-2 border-ink bg-cream">
                        <motion.div
                          initial={false}
                          animate={{ width: `${charPct}%` }}
                          transition={{ ease: "easeOut", duration: 0.2 }}
                          className={`h-full ${charBarColor}`}
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        full
                        disabled={!canSubmit}
                        className="mt-4"
                      >
                        {submitting
                          ? "Generating…"
                          : timeOut
                          ? "Time's up"
                          : remainingAttempts === 0
                          ? "Cap reached"
                          : overCap
                          ? "Too long"
                          : `Submit (${remainingAttempts} left)`}
                      </Button>

                      {submitError && (
                        <motion.p
                          role="alert"
                          initial={reduce ? false : { y: -6, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="mt-3 rounded-xl border-[3px] border-ink bg-pink px-3 py-2 text-center font-heading text-xs font-semibold"
                        >
                          {submitError}
                        </motion.p>
                      )}
                    </>
                  )}
                </form>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attempts grid (prompt phase only) */}
        {!inMemorize && !isSpectator && attempts.length > 0 && (
          <Card elevation="sm" className="mt-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
                Your attempts
              </h3>
              <span className="font-heading text-xs text-ink/50">
                pick which one to submit after the round
              </span>
            </div>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.05 } },
              }}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {attempts.map((a, i) => (
                <motion.div
                  key={a.id}
                  variants={{
                    hidden: reduce
                      ? { opacity: 1 }
                      : { opacity: 0, y: 14, scale: 0.94 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: {
                        type: "spring",
                        stiffness: 280,
                        damping: 20,
                      },
                    },
                  }}
                  whileHover={reduce ? undefined : { y: -3 }}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border-[3px] border-ink bg-white shadow-chunky-sm transition-shadow hover:shadow-chunky"
                >
                  <div className="relative aspect-square overflow-hidden border-b-[3px] border-ink bg-cream">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.imageUrl}
                      alt={a.prompt}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="absolute left-1.5 top-1.5 rounded-full border-2 border-ink bg-golf px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums shadow-chunky-sm">
                      #{i + 1}
                    </span>
                    <span className="absolute right-1.5 top-1.5 rounded-full border-2 border-ink bg-white px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums">
                      {a.chars}c
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 p-2">
                    <p className="line-clamp-2 font-heading text-xs leading-snug">
                      {a.prompt}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </Card>
        )}

        {/* Player strip with avatars + submission ring */}
        <Card elevation="sm" className="mt-4 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Players
            </h3>
            <span className="font-heading text-xs text-ink/50">
              {inMemorize ? "everyone is memorizing" : "live submissions"}
            </span>
          </div>
          <ul className="flex flex-wrap gap-3">
            {submittedPlayers.map((p) => {
              const isYou = p.userId === userId;
              const submitted = Math.min(
                settings.attemptsPerRound,
                submissionCounts[p.userId] ?? 0
              );
              const ringPct =
                settings.attemptsPerRound > 0
                  ? (submitted / settings.attemptsPerRound) * 100
                  : 0;
              return (
                <li
                  key={p.userId}
                  className={`flex items-center gap-2 rounded-full border-[3px] border-ink py-1 pl-1 pr-3 font-heading text-xs shadow-chunky-sm ${
                    isYou ? "bg-sun" : "bg-white"
                  }`}
                >
                  <span
                    className="relative inline-flex h-9 w-9 items-center justify-center rounded-full"
                    style={{
                      background: inMemorize
                        ? "var(--color-cream)"
                        : `conic-gradient(var(--color-golf) ${ringPct}%, var(--color-cream) 0)`,
                    }}
                    aria-hidden="true"
                  >
                    <span className="absolute inset-[3px] overflow-hidden rounded-full border-2 border-ink bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarUrl(p.avatarSeed || p.userId)}
                        alt=""
                        className="h-full w-full"
                      />
                    </span>
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="max-w-[7rem] truncate font-bold">
                      {p.name}
                      {isYou && (
                        <span className="ml-1 text-ink/50">(you)</span>
                      )}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-ink/50 tabular-nums">
                      {inMemorize
                        ? "looking"
                        : `${submitted} / ${settings.attemptsPerRound}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        {isHost && (
          <p className="mt-4 text-center font-heading text-xs text-ink/40">
            host · round will end automatically
          </p>
        )}
      </div>
    </main>
  );
}
