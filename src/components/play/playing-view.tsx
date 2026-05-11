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
import { MicButton } from "./mic-button";

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
    <main
      className={`relative flex flex-1 flex-col overflow-hidden px-4 pb-28 pt-5 transition-colors duration-300 ${
        inMemorize ? "bg-[#EAF6FF]" : "bg-cream"
      }`}
    >
      {/* Ambient backdrop: soft radial spotlight + drifting glyphs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background: inMemorize
              ? "radial-gradient(ellipse at top, rgba(56,189,248,0.25), transparent 60%)"
              : "radial-gradient(ellipse at top, rgba(34,197,94,0.18), transparent 60%)",
          }}
        />
        {!reduce &&
          AMBIENT_GLYPHS.map((glyph, i) => (
            <motion.span
              key={i}
              className="absolute select-none text-4xl opacity-[0.08] sm:text-5xl"
              initial={{
                x: `${(i * 23) % 100}%`,
                y: `${(i * 37) % 100}%`,
              }}
              animate={{
                y: [
                  `${(i * 37) % 100}%`,
                  `${((i * 37) % 100) - 8}%`,
                  `${(i * 37) % 100}%`,
                ],
                rotate: [0, i % 2 === 0 ? 8 : -8, 0],
              }}
              transition={{
                duration: 9 + (i % 3),
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.7,
              }}
            >
              {glyph}
            </motion.span>
          ))}
      </div>

      {/* Urgency vignette: pink glow on last 5s */}
      <AnimatePresence>
        {urgent && !reduce && (
          <motion.div
            key="urgency"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 0.6, 0.35] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, repeat: Infinity }}
            style={{
              boxShadow: "inset 0 0 120px 40px rgba(244,114,182,0.55)",
            }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 mx-auto w-full max-w-4xl">
        {/* Top strip: leave + scorecard chip + live-status pip */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <Button variant="neutral" size="sm" onClick={onLeave}>
            ← Leave
          </Button>

          <div className="flex min-w-0 items-center gap-1.5 rounded-full border-[3px] border-ink bg-white px-2 py-1 shadow-chunky-sm">
            <span className="rounded-full border-2 border-ink bg-golf px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums">
              R{currentRound}/{settings.rounds}
            </span>
            {category && (
              <span
                className="flex items-center gap-1 rounded-full border-2 border-ink px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: category.color }}
              >
                <span aria-hidden="true">{category.emoji}</span>
                <span className="hidden sm:inline">{category.label}</span>
              </span>
            )}
            <span
              className={`flex items-center gap-1 rounded-full border-2 border-ink bg-cream px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide ${
                inMemorize ? "text-sky" : "text-golf"
              }`}
            >
              <motion.span
                animate={reduce ? undefined : { opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  inMemorize ? "bg-sky" : "bg-golf"
                }`}
              />
              {inMemorize ? "study" : "play"}
            </span>
          </div>
        </div>

        {/* PHASE BODY */}
        <AnimatePresence mode="wait">
          {inMemorize ? (
            /* MEMORIZE — target image is the hero, framed like a championship hole */
            <motion.section
              key="memorize"
              initial={reduce ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex flex-col items-center"
            >
              <motion.div
                initial={reduce ? false : { y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.05 }}
                className="mb-3 flex items-center gap-2"
              >
                <span className="rounded-full border-[3px] border-ink bg-sky px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide shadow-chunky-sm">
                  👁 Memorize
                </span>
                <span className="font-heading text-[11px] font-semibold uppercase tracking-wide text-ink/50">
                  it disappears in {secondsLeft}s
                </span>
              </motion.div>

              <div className="relative w-full max-w-xl">
                {/* Target frame */}
                <motion.div
                  whileHover={reduce ? undefined : { rotate: -0.5 }}
                  className="relative aspect-square w-full overflow-hidden rounded-3xl border-[4px] border-ink bg-cream shadow-chunky-lg"
                >
                  {targetImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={targetImageUrl}
                      alt="Target image"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <motion.div
                          animate={reduce ? undefined : { rotate: [0, -8, 8, 0] }}
                          transition={{
                            duration: 1.6,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          className="text-7xl"
                          aria-hidden="true"
                        >
                          🎨
                        </motion.div>
                        <p className="mt-3 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
                          target loading…
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Inner soft vignette for cinematic feel */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-3xl"
                    style={{
                      boxShadow: "inset 0 0 60px 8px rgba(10,10,10,0.18)",
                    }}
                  />

                  {/* Big timer overlay, bottom-right corner */}
                  <motion.div
                    animate={
                      urgent && !reduce
                        ? { scale: [1, 1.08, 1] }
                        : { scale: 1 }
                    }
                    transition={{ duration: 0.6, repeat: urgent ? Infinity : 0 }}
                    className={`absolute bottom-3 right-3 flex items-baseline gap-0.5 rounded-2xl border-[3px] border-ink px-3 py-1 font-heading font-bold tabular-nums shadow-chunky-sm ${
                      urgent ? "bg-pink" : "bg-white"
                    }`}
                    aria-live="polite"
                  >
                    <span className="text-3xl">{secondsLeft}</span>
                    <span className="text-xs text-ink/50">s</span>
                  </motion.div>
                </motion.div>

                {/* Progress bar wrapping the bottom edge */}
                <div
                  className="mt-3 h-2.5 overflow-hidden rounded-full border-[3px] border-ink bg-white"
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

              <p className="mt-5 max-w-md text-center font-heading text-sm text-ink/60">
                burn this image into your memory — the prompt phase starts soon.
              </p>
            </motion.section>
          ) : (
            /* PROMPT — input is the hero, target sticks to a corner reference */
            <motion.section
              key="prompt"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {/* Slim sticky timer bar above the prompt card */}
              <div className="mb-3 flex items-center gap-3 rounded-full border-[3px] border-ink bg-white px-3 py-1.5 shadow-chunky-sm">
                <span className="rounded-full border-2 border-ink bg-sun px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
                  ✍ Prompt
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-cream">
                  <motion.div
                    initial={false}
                    animate={{ width: `${barPct}%` }}
                    transition={{ ease: "linear", duration: 0.25 }}
                    className={`h-full ${barColor}`}
                  />
                </div>
                <motion.span
                  animate={
                    urgent && !reduce ? { scale: [1, 1.12, 1] } : { scale: 1 }
                  }
                  transition={{
                    duration: 0.5,
                    repeat: urgent ? Infinity : 0,
                  }}
                  className={`min-w-[3ch] text-right font-heading text-lg font-bold tabular-nums ${
                    urgent ? "text-pink" : timeOut ? "text-ink/40" : "text-ink"
                  }`}
                  aria-live="polite"
                >
                  {secondsLeft}s
                </motion.span>
              </div>

              <Card>
                {/* Header row: title + reference thumb + attempts left */}
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-2xl font-bold uppercase tracking-tight">
                      Take Your Shot
                    </h2>
                    <p className="font-heading text-xs text-ink/50">
                      shortest prompt that nails the image wins votes
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {targetImageUrl && (
                      <motion.div
                        whileHover={reduce ? undefined : { scale: 1.06, rotate: -2 }}
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-[3px] border-ink shadow-chunky-sm"
                        title="target reference"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={targetImageUrl}
                          alt="Target reference"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-ink bg-sky px-1 py-0.5 font-heading text-[8px] font-bold uppercase">
                          ref
                        </span>
                      </motion.div>
                    )}
                    <span className="rounded-full border-[3px] border-ink bg-cream px-2 py-1 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums">
                      {remainingAttempts}/{settings.attemptsPerRound}
                    </span>
                  </div>
                </div>

                {isSpectator ? (
                  <div className="flex flex-1 items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/40 bg-cream p-10 text-center">
                    <div>
                      <div className="text-5xl" aria-hidden="true">
                        👀
                      </div>
                      <p className="mt-3 font-heading text-base font-bold uppercase tracking-wide text-ink/70">
                        spectating
                      </p>
                      <p className="mt-1 font-heading text-xs text-ink/40">
                        room is at capacity — enjoy the show
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col">
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
                        className="min-h-32 w-full resize-none rounded-2xl border-[3px] border-ink bg-cream px-4 py-3 pr-20 font-heading text-lg leading-snug outline-none transition focus:bg-white focus:shadow-chunky-sm disabled:opacity-60 sm:min-h-36 sm:px-5 sm:py-4 sm:pr-24 sm:text-2xl"
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

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full border-2 border-ink bg-cream">
                      <motion.div
                        initial={false}
                        animate={{ width: `${charPct}%` }}
                        transition={{ ease: "easeOut", duration: 0.2 }}
                        className={`h-full ${charBarColor}`}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 font-heading text-[11px]">
                      <span
                        className={
                          overCap ? "font-bold text-pink" : "text-ink/55"
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

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                      <div className="sm:w-auto">
                        <MicButton
                          disabled={
                            submitting ||
                            timeOut ||
                            remainingAttempts === 0
                          }
                          onTranscript={(text) => {
                            setSubmitError(null);
                            setPrompt((prev) => {
                              const trimmed = prev.trimEnd();
                              const joined = trimmed
                                ? `${trimmed} ${text}`
                                : text;
                              return joined.slice(
                                0,
                                settings.promptMaxLength,
                              );
                            });
                          }}
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        full
                        disabled={!canSubmit}
                        className="flex-1"
                      >
                        {submitting
                          ? "Generating…"
                          : timeOut
                          ? "Time's up"
                          : remainingAttempts === 0
                          ? "Cap reached"
                          : overCap
                          ? "Too long"
                          : `⛳ Tee Off (${remainingAttempts} left)`}
                      </Button>
                    </div>

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
                  </form>
                )}
              </Card>

              {/* Attempts reel — horizontal scrolling scorecard */}
              {!isSpectator && attempts.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h3 className="font-heading text-xs font-bold uppercase tracking-wide text-ink/60">
                      Your shots
                    </h3>
                    <span className="font-heading text-[10px] uppercase tracking-wide text-ink/40">
                      pick your best after the round
                    </span>
                  </div>
                  <motion.ul
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: {},
                      visible: { transition: { staggerChildren: 0.05 } },
                    }}
                    className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]"
                  >
                    {attempts.map((a, i) => (
                      <motion.li
                        key={a.id}
                        variants={{
                          hidden: reduce
                            ? { opacity: 1 }
                            : { opacity: 0, y: 12, scale: 0.94 },
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
                        className="group relative w-32 shrink-0 snap-start overflow-hidden rounded-2xl border-[3px] border-ink bg-white shadow-chunky-sm transition-shadow hover:shadow-chunky sm:w-40"
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
                        <p className="line-clamp-2 px-2 py-2 font-heading text-[11px] leading-snug">
                          {a.prompt}
                        </p>
                      </motion.li>
                    ))}
                  </motion.ul>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {isHost && (
          <p className="mt-4 text-center font-heading text-[11px] text-ink/40">
            host · round will end automatically
          </p>
        )}
      </div>

      {/* Bottom rail: live player submissions */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 px-3 pb-3">
        <div className="pointer-events-auto mx-auto max-w-4xl rounded-2xl border-[3px] border-ink bg-white/95 px-3 py-2 shadow-chunky-sm backdrop-blur">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/55">
              Players
            </h3>
            <span className="font-heading text-[10px] uppercase tracking-wide text-ink/40">
              {inMemorize ? "everyone is studying" : "live submissions"}
            </span>
          </div>
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
            {submittedPlayers.map((p) => {
              const isYou = p.userId === userId;
              const submitted = Math.min(
                settings.attemptsPerRound,
                submissionCounts[p.userId] ?? 0,
              );
              const ringPct =
                settings.attemptsPerRound > 0
                  ? (submitted / settings.attemptsPerRound) * 100
                  : 0;
              const done = submitted >= settings.attemptsPerRound;
              return (
                <li
                  key={p.userId}
                  className={`flex shrink-0 items-center gap-2 rounded-full border-[3px] border-ink py-0.5 pl-0.5 pr-2.5 font-heading text-[11px] shadow-chunky-sm ${
                    isYou ? "bg-sun" : done ? "bg-golf/30" : "bg-white"
                  }`}
                >
                  <span
                    className="relative inline-flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      background: inMemorize
                        ? "var(--color-cream)"
                        : `conic-gradient(var(--color-golf) ${ringPct}%, var(--color-cream) 0)`,
                    }}
                    aria-hidden="true"
                  >
                    <span className="absolute inset-[2px] overflow-hidden rounded-full border-2 border-ink bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarUrl(p.avatarSeed || p.userId)}
                        alt=""
                        className="h-full w-full"
                      />
                    </span>
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="max-w-[6rem] truncate font-bold">
                      {p.name}
                      {isYou && <span className="ml-1 text-ink/50">(you)</span>}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-ink/50 tabular-nums">
                      {inMemorize
                        ? "looking"
                        : `${submitted}/${settings.attemptsPerRound}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </main>
  );
}
