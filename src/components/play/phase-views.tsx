"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Attempt, RoomState, Vote } from "@/lib/types";
import { ApiError, getRoundDetails, restartRoom, submitVote } from "@/lib/api";
import { tryCatch } from "@/lib/result";
import { getPusher } from "@/lib/pusher-client";
import { useSoundEffect } from "@/components/sound-provider";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { findCategory } from "@/lib/room-constants";
import { avatarUrl } from "@/lib/avatar";
import { usePhaseCountdown } from "./use-phase-countdown";

interface PhaseProps {
  roomState: RoomState;
  userId: string;
  onLeave: () => void;
  code?: string;
}

interface VotingPhaseProps extends PhaseProps {
  code: string;
}

export function VotingView({
  code,
  roomState,
  userId,
  onLeave,
}: VotingPhaseProps) {
  const { playBubble } = useSoundEffect();
  const reduce = useReducedMotion();
  const secondsLeft = usePhaseCountdown(roomState.phaseEndsAt);
  const { currentRound, settings } = roomState;
  const category = findCategory(settings.category);

  const [finalAttempts, setFinalAttempts] = useState<Attempt[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [targetImageUrl, setTargetImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState<boolean>(false);

  // Initial fetch + refetch whenever a vote-submitted broadcast lands.
  const refetch = useCallback(async () => {
    const [err, data] = await tryCatch(getRoundDetails(code, currentRound));
    if (err) {
      console.error("getRoundDetails failed:", err);
      return;
    }
    setFinalAttempts(data.finalAttempts);
    setVotes(data.votes);
    setTargetImageUrl(data.targetImageUrl);
    setLoading(false);
  }, [code, currentRound]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch updates state from server-side data; this is the canonical fetch-on-mount pattern
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const pusher = getPusher();
    const channel = pusher.subscribe(`presence-room-${code}`);
    const onVote = () => {
      void refetch();
    };
    channel.bind("vote-submitted", onVote);
    return () => {
      channel.unbind("vote-submitted", onVote);
    };
  }, [code, refetch]);

  // Filter out my own pick — server also rejects self-votes (400), but we
  // never even show the button.
  const votableAttempts = useMemo(
    () => finalAttempts.filter((a) => a.userId !== userId),
    [finalAttempts, userId],
  );

  const myVote = useMemo(
    () => votes.find((v) => v.voterId === userId) ?? null,
    [votes, userId],
  );

  const playersById = useMemo(() => {
    const map: Record<string, { name: string; avatarSeed: string }> = {};
    for (const p of roomState.players) {
      map[p.userId] = { name: p.name, avatarSeed: p.avatarSeed };
    }
    return map;
  }, [roomState.players]);

  // Total voters in the room (everyone except spectators of finished attempts).
  // We only track count, not who voted for whom — targets stay private until reveal.
  const totalVoters = roomState.players.filter(
    (p) => p.role === "prompter",
  ).length;
  const votesCast = votes.length;

  const handleVote = async (targetUserId: string) => {
    if (voteBusy) return;
    if (targetUserId === userId) return;
    playBubble();
    setVoteError(null);
    setVoteBusy(true);
    // Optimistic: replace any prior vote by us.
    const prev = votes;
    setVotes((vs) => [
      ...vs.filter((v) => v.voterId !== userId),
      { voterId: userId, targetId: targetUserId, submittedAt: Date.now() },
    ]);
    const [err] = await tryCatch(submitVote(code, targetUserId));
    setVoteBusy(false);
    if (err) {
      setVotes(prev);
      setVoteError(err instanceof ApiError ? err.message : "Vote failed");
    }
  };

  const urgent = secondsLeft <= 5 && secondsLeft > 0;
  const votedAttempt = myVote
    ? votableAttempts.find((a) => a.userId === myVote.targetId) ?? null
    : null;

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-cream px-4 pb-8 pt-5">
      {/* Judges' panel backdrop — sun + sky tint */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(250,204,21,0.18), transparent 55%), radial-gradient(ellipse at bottom left, rgba(56,189,248,0.12), transparent 55%)",
        }}
      />

      <AnimatePresence>
        {urgent && !reduce && (
          <motion.div
            key="urgency"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.55, 0.3] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, repeat: Infinity }}
            style={{ boxShadow: "inset 0 0 120px 40px rgba(244,114,182,0.55)" }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 mx-auto w-full max-w-5xl">
        {/* Top strip */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <Button variant="neutral" size="sm" onClick={onLeave}>
            ← Leave
          </Button>

          <div className="flex items-center gap-1.5 rounded-full border-[3px] border-ink bg-white px-2 py-1 shadow-chunky-sm">
            <span className="rounded-full border-2 border-ink bg-sun px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
              ⚖ Vote
            </span>
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
            <motion.span
              animate={
                urgent && !reduce ? { scale: [1, 1.1, 1] } : { scale: 1 }
              }
              transition={{ duration: 0.5, repeat: urgent ? Infinity : 0 }}
              className={`rounded-full border-2 border-ink px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums ${
                urgent ? "bg-pink text-ink" : "bg-cream"
              }`}
              aria-live="polite"
            >
              {secondsLeft}s
            </motion.span>
          </div>
        </div>

        {/* Hero header */}
        <div className="mb-5 text-center">
          <motion.h1
            initial={reduce ? false : { y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className="font-heading text-4xl font-bold uppercase tracking-tight sm:text-5xl"
          >
            Cast Your Vote
          </motion.h1>
          <p className="mt-1 font-heading text-sm text-ink/55">
            which player got closest to the target?
          </p>
        </div>

        {/* Compare layout: target sticky left + candidates right */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          {/* Target reference + live vote tally + your current vote */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="relative">
              <span className="absolute -top-3 left-4 z-10 rounded-full border-[3px] border-ink bg-sky px-3 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide shadow-chunky-sm">
                🎯 Target
              </span>
              <Card className="p-4">
                {targetImageUrl ? (
                  <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-[3px] border-ink bg-cream shadow-chunky-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={targetImageUrl}
                      alt="Target image"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/30 bg-cream font-heading text-xs text-ink/40">
                    target unavailable
                  </div>
                )}

                {/* Live anonymous tally */}
                <div className="mt-4 rounded-2xl border-[3px] border-ink bg-cream/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/55">
                      votes in
                    </span>
                    <span className="font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums text-ink/70">
                      {votesCast}/{totalVoters}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full border-2 border-ink bg-white">
                    <motion.div
                      initial={false}
                      animate={{
                        width:
                          totalVoters > 0
                            ? `${(votesCast / totalVoters) * 100}%`
                            : "0%",
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 240,
                        damping: 24,
                      }}
                      className="h-full bg-golf"
                    />
                  </div>
                </div>

                {/* Your vote preview */}
                <div className="mt-3 rounded-2xl border-[3px] border-dashed border-ink/30 bg-white/70 p-3">
                  <span className="mb-1 block font-heading text-[10px] font-bold uppercase tracking-wide text-ink/55">
                    your vote
                  </span>
                  <AnimatePresence mode="wait">
                    {votedAttempt ? (
                      <motion.div
                        key={votedAttempt.id}
                        initial={
                          reduce ? false : { scale: 0.92, opacity: 0 }
                        }
                        animate={{ scale: 1, opacity: 1 }}
                        exit={
                          reduce ? undefined : { scale: 0.92, opacity: 0 }
                        }
                        transition={{
                          type: "spring",
                          stiffness: 360,
                          damping: 22,
                        }}
                        className="flex items-center gap-2"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border-[3px] border-ink shadow-chunky-sm">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={votedAttempt.imageUrl}
                            alt={votedAttempt.prompt}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="block truncate font-heading text-xs font-bold uppercase tracking-wide">
                            {playersById[votedAttempt.userId]?.name ?? "Player"}
                          </span>
                          <span
                            className="block truncate font-heading text-[10px] text-ink/55"
                            title={votedAttempt.prompt}
                          >
                            {votedAttempt.prompt}
                          </span>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.p
                        key="empty"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="font-heading text-xs text-ink/40"
                      >
                        tap a candidate →
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </Card>
            </div>
          </div>

          {/* Candidates */}
          <Card>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-heading text-lg font-bold uppercase tracking-wide">
                Candidates
              </h2>
              <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/40">
                you can change your vote until the timer ends
              </span>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-2xl border-[3px] border-ink bg-cream"
                  >
                    <motion.div
                      animate={
                        reduce ? undefined : { opacity: [0.4, 0.7, 0.4] }
                      }
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                        delay: i * 0.15,
                      }}
                      className="h-full w-full rounded-2xl bg-white/40"
                    />
                  </div>
                ))}
              </div>
            ) : votableAttempts.length === 0 ? (
              <div className="flex items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/40 bg-cream p-10 text-center">
                <div>
                  <div className="text-5xl">🦗</div>
                  <p className="mt-2 font-heading text-sm font-semibold text-ink/55">
                    no candidates to vote on
                  </p>
                  <p className="mt-1 font-heading text-xs text-ink/40">
                    nobody else submitted this round
                  </p>
                </div>
              </div>
            ) : (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.05 } },
                }}
                className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              >
                {votableAttempts.map((a) => {
                  const author = playersById[a.userId];
                  const authorName = author?.name ?? "Player";
                  const authorSeed = author?.avatarSeed ?? a.userId;
                  const selected = myVote?.targetId === a.userId;
                  return (
                    <motion.button
                      key={a.id}
                      type="button"
                      onClick={() => handleVote(a.userId)}
                      disabled={voteBusy}
                      aria-pressed={selected}
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
                      whileHover={
                        reduce || selected ? undefined : { y: -3 }
                      }
                      whileTap={reduce ? undefined : { scale: 0.97 }}
                      className={`group relative flex flex-col overflow-hidden rounded-2xl border-[3px] border-ink text-left transition-shadow disabled:cursor-not-allowed ${
                        selected
                          ? "bg-golf shadow-chunky"
                          : "bg-white shadow-chunky-sm hover:shadow-chunky"
                      }`}
                    >
                      <div
                        className={`relative aspect-square overflow-hidden border-b-[3px] border-ink ${
                          selected ? "bg-golf" : "bg-cream"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.imageUrl}
                          alt={`Attempt by ${authorName}`}
                          className={`h-full w-full object-cover transition-transform duration-300 ${
                            !selected && !reduce
                              ? "group-hover:scale-105"
                              : ""
                          }`}
                        />
                        {/* Author chip */}
                        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full border-2 border-ink bg-white py-0.5 pl-0.5 pr-2 font-heading text-[10px] font-bold uppercase tracking-wide shadow-chunky-sm">
                          <span className="inline-block h-5 w-5 overflow-hidden rounded-full border border-ink bg-cream">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={avatarUrl(authorSeed)}
                              alt=""
                              className="h-full w-full"
                            />
                          </span>
                          <span className="max-w-[6rem] truncate">
                            {authorName}
                          </span>
                        </span>
                        <span className="absolute right-1.5 top-1.5 rounded-full border-2 border-ink bg-white px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums">
                          {a.chars}c
                        </span>

                        {/* Big VOTED stamp */}
                        <AnimatePresence>
                          {selected && (
                            <motion.div
                              initial={
                                reduce
                                  ? false
                                  : { scale: 0.4, opacity: 0, rotate: -14 }
                              }
                              animate={{ scale: 1, opacity: 1, rotate: -8 }}
                              exit={
                                reduce
                                  ? undefined
                                  : { scale: 0.6, opacity: 0 }
                              }
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 16,
                              }}
                              className="pointer-events-none absolute inset-0 flex items-center justify-center"
                            >
                              <div className="rounded-2xl border-[4px] border-ink bg-pink px-4 py-1.5 font-heading text-base font-extrabold uppercase tracking-wider shadow-chunky">
                                ✓ Voted
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <p
                        className={`line-clamp-2 px-2 py-1.5 font-heading text-[11px] leading-snug ${
                          selected ? "font-bold" : "text-ink/75"
                        }`}
                        title={a.prompt}
                      >
                        {a.prompt}
                      </p>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}

            {voteError && (
              <motion.p
                role="alert"
                initial={reduce ? false : { y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mt-4 rounded-xl border-[3px] border-ink bg-pink px-4 py-2 text-center font-heading text-xs font-semibold"
              >
                {voteError}
              </motion.p>
            )}

            {!myVote && votableAttempts.length > 0 && !loading && (
              <p className="mt-3 text-center font-heading text-[11px] text-ink/45">
                no vote? you skip this round&apos;s tally
              </p>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

interface RankedRow {
  userId: string;
  name: string;
  avatarSeed: string;
  score: number;
  rank: number;
}

function rankPlayers(
  scores: Record<string, number>,
  players: RoomState["players"],
): RankedRow[] {
  const rows = players
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      avatarSeed: p.avatarSeed,
      score: scores[p.userId] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  return rows.reduce<RankedRow[]>((acc, r, i) => {
    const prev = acc[acc.length - 1];
    const rank = prev && prev.score === r.score ? prev.rank : i + 1;
    acc.push({ ...r, rank });
    return acc;
  }, []);
}

const RANK_TINTS: Record<number, { bg: string; medal: string }> = {
  1: { bg: "bg-sun", medal: "🥇" },
  2: { bg: "bg-sky/60", medal: "🥈" },
  3: { bg: "bg-pink/60", medal: "🥉" },
};

function ScoreList({
  scores,
  players,
  selfId,
}: {
  scores: Record<string, number>;
  players: RoomState["players"];
  selfId?: string;
}) {
  const ranks = rankPlayers(scores, players);
  const reduce = useReducedMotion();

  return (
    <motion.ol
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
      className="flex flex-col gap-2"
    >
      {ranks.map((r) => {
        const tint = RANK_TINTS[r.rank];
        const isSelf = selfId === r.userId;
        return (
          <motion.li
            key={r.userId}
            variants={{
              hidden: reduce
                ? { opacity: 1 }
                : { opacity: 0, x: -16, scale: 0.96 },
              visible: {
                opacity: 1,
                x: 0,
                scale: 1,
                transition: { type: "spring", stiffness: 320, damping: 22 },
              },
            }}
            className={`flex items-center justify-between rounded-2xl border-[3px] border-ink px-3 py-2 shadow-chunky-sm ${
              tint?.bg ?? "bg-cream"
            } ${isSelf ? "ring-2 ring-ink ring-offset-2 ring-offset-cream" : ""}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-white font-heading text-sm font-bold tabular-nums">
                {tint?.medal ?? `#${r.rank}`}
              </span>
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-[3px] border-ink bg-cream">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl(r.avatarSeed || r.userId)}
                  alt=""
                  className="h-full w-full"
                />
              </span>
              <span className="min-w-0 truncate font-heading text-base font-bold">
                {r.name}
                {isSelf && (
                  <span className="ml-1 text-xs font-semibold text-ink/55">
                    (you)
                  </span>
                )}
              </span>
            </div>
            <CountUp
              value={r.score}
              className="font-heading text-2xl font-extrabold tabular-nums"
            />
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

function CountUp({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- count-up animation: setDisplay drives the visible number per requestAnimationFrame
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const dur = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);

  return <span className={className}>{display}</span>;
}

export function RevealView({ roomState, userId, onLeave }: PhaseProps) {
  const reduce = useReducedMotion();
  const secondsLeft = usePhaseCountdown(roomState.phaseEndsAt);
  const { settings, currentRound, targetImageUrl, targetPrompt } = roomState;
  const category = findCategory(settings.category);
  const urgent = secondsLeft <= 3 && secondsLeft > 0;

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-cream px-4 pb-8 pt-5">
      {/* Curtain-reveal backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(168,85,247,0.22), transparent 55%), radial-gradient(ellipse at bottom, rgba(250,204,21,0.15), transparent 55%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-4xl">
        {/* Top strip */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <Button variant="neutral" size="sm" onClick={onLeave}>
            ← Leave
          </Button>
          <div className="flex items-center gap-1.5 rounded-full border-[3px] border-ink bg-white px-2 py-1 shadow-chunky-sm">
            <span className="rounded-full border-2 border-ink bg-purple px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
              ✨ Reveal
            </span>
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
              className={`rounded-full border-2 border-ink px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums ${
                urgent ? "bg-pink" : "bg-cream"
              }`}
            >
              {secondsLeft}s
            </span>
          </div>
        </div>

        {/* Drumroll header */}
        <div className="mb-5 text-center">
          <motion.h1
            initial={reduce ? false : { y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className="font-heading text-4xl font-bold uppercase tracking-tight sm:text-5xl"
          >
            The Reveal
          </motion.h1>
          <p className="mt-1 font-heading text-sm text-ink/55">
            here&apos;s what we asked the AI to draw
          </p>
        </div>

        {/* Target + secret prompt — side by side on desktop */}
        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {targetImageUrl && (
            <motion.div
              initial={
                reduce ? false : { opacity: 0, scale: 0.94, rotate: -1 }
              }
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
              className="relative"
            >
              <span className="absolute -top-3 left-4 z-10 rounded-full border-[3px] border-ink bg-sky px-3 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide shadow-chunky-sm">
                🎯 Target
              </span>
              <Card className="p-3">
                <div className="aspect-square w-full overflow-hidden rounded-2xl border-[3px] border-ink bg-cream shadow-chunky-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={targetImageUrl}
                    alt="Target image"
                    className="h-full w-full object-cover"
                  />
                </div>
              </Card>
            </motion.div>
          )}

          <motion.div
            initial={reduce ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              type: "spring",
              stiffness: 240,
              damping: 24,
              delay: 0.15,
            }}
            className="relative"
          >
            <span className="absolute -top-3 left-4 z-10 rounded-full border-[3px] border-ink bg-purple px-3 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide shadow-chunky-sm">
              🤫 Secret prompt
            </span>
            <Card className="flex h-full min-h-[12rem] flex-col justify-center p-6">
              <span
                aria-hidden="true"
                className="font-heading text-5xl leading-none text-ink/15"
              >
                &ldquo;
              </span>
              <p className="-mt-2 px-1 font-heading text-2xl font-bold leading-snug sm:text-3xl">
                {targetPrompt ?? "(hidden)"}
              </p>
              <span
                aria-hidden="true"
                className="self-end font-heading text-5xl leading-none text-ink/15"
              >
                &rdquo;
              </span>
            </Card>
          </motion.div>
        </div>

        {/* Leaderboard */}
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-heading text-lg font-bold uppercase tracking-wide">
              Leaderboard
            </h2>
            <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/40">
              cumulative · highest wins
            </span>
          </div>
          <ScoreList
            scores={roomState.scores}
            players={roomState.players}
            selfId={userId}
          />
        </Card>
      </div>
    </main>
  );
}

const CONFETTI_GLYPHS = ["⛳", "🏌️", "🎉", "✨", "🟢", "🏆"];

function ConfettiBurst({ count = 18 }: { count?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {Array.from({ length: count }).map((_, i) => {
        const glyph = CONFETTI_GLYPHS[i % CONFETTI_GLYPHS.length];
        const left = (i * 53) % 100;
        const delay = (i % 6) * 0.18;
        const dur = 4 + (i % 4);
        return (
          <motion.span
            key={i}
            className="absolute select-none text-3xl"
            style={{ left: `${left}%`, top: "-10%" }}
            initial={{ y: "-10vh", rotate: 0, opacity: 0 }}
            animate={{
              y: ["-10vh", "110vh"],
              rotate: [0, i % 2 ? 360 : -360],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: dur,
              repeat: Infinity,
              delay,
              ease: "easeIn",
              times: [0, 0.05, 0.85, 1],
            }}
          >
            {glyph}
          </motion.span>
        );
      })}
    </div>
  );
}

export function EndedView({ roomState, userId, onLeave, code }: PhaseProps) {
  const reduce = useReducedMotion();
  const isHost = roomState.hostId === userId;
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const handleRestart = async () => {
    if (!code || restarting) return;
    setRestarting(true);
    setRestartError(null);
    const [err] = await tryCatch(restartRoom(code));
    setRestarting(false);
    if (err) {
      setRestartError(err instanceof ApiError ? err.message : "Failed to restart");
    }
    // On success the server broadcasts `game-restarted`; the parent page
    // re-fetches room state and switches back to the lobby view.
  };

  const ranks = rankPlayers(roomState.scores, roomState.players);
  const winners = ranks.filter((r) => r.rank === 1);
  const runnersUp = ranks.filter((r) => r.rank > 1);
  const youWon = winners.some((w) => w.userId === userId);

  // Podium order: 2nd, 1st, 3rd (visually centered champion)
  const podium = ranks.filter((r) => r.rank <= 3);
  const podiumByRank: Record<number, RankedRow[]> = {};
  for (const r of podium) {
    podiumByRank[r.rank] = [...(podiumByRank[r.rank] ?? []), r];
  }

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-cream px-4 pb-8 pt-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(250,204,21,0.28), transparent 55%), radial-gradient(ellipse at bottom, rgba(34,197,94,0.18), transparent 55%)",
        }}
      />
      <ConfettiBurst />

      <div className="relative z-10 mx-auto w-full max-w-3xl">
        {/* Top strip */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <Button variant="neutral" size="sm" onClick={onLeave}>
            ← Leave
          </Button>
          <span className="rounded-full border-[3px] border-ink bg-golf px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide shadow-chunky-sm">
            🏁 Final
          </span>
        </div>

        {/* Champion banner */}
        <motion.div
          initial={reduce ? false : { y: -16, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
          className="mb-6 text-center"
        >
          <motion.div
            animate={
              reduce ? undefined : { rotate: [0, -6, 6, -3, 3, 0] }
            }
            transition={{
              duration: 1.6,
              repeat: Infinity,
              repeatDelay: 1.5,
              ease: "easeInOut",
            }}
            className="mb-2 text-7xl"
            aria-hidden="true"
          >
            🏆
          </motion.div>
          <h1 className="font-heading text-5xl font-extrabold uppercase tracking-tight sm:text-6xl">
            Game Over
          </h1>
          <p className="mt-2 font-heading text-base font-semibold uppercase tracking-wide text-ink/60">
            {winners.length === 1
              ? `${winners[0]?.name ?? "Champion"} wins`
              : winners.length > 1
              ? `${winners.length}-way tie`
              : "no winner"}
          </p>
          {youWon && (
            <motion.div
              initial={reduce ? false : { scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: -4 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 18,
                delay: 0.3,
              }}
              className="mx-auto mt-3 inline-block rounded-2xl border-[4px] border-ink bg-sun px-5 py-1.5 font-heading text-lg font-extrabold uppercase tracking-wider shadow-chunky"
            >
              ✨ that&apos;s you ✨
            </motion.div>
          )}
        </motion.div>

        {/* Podium */}
        {podium.length > 0 && (
          <div className="mb-6 flex items-end justify-center gap-3 sm:gap-4">
            {/* 2nd place */}
            <PodiumColumn
              rows={podiumByRank[2] ?? []}
              height="h-28"
              tint="bg-sky/60"
              label="2nd"
              medal="🥈"
            />
            {/* 1st place — taller, sun-tinted */}
            <PodiumColumn
              rows={podiumByRank[1] ?? []}
              height="h-40"
              tint="bg-sun"
              label="1st"
              medal="🥇"
              champion
            />
            {/* 3rd place */}
            <PodiumColumn
              rows={podiumByRank[3] ?? []}
              height="h-20"
              tint="bg-pink/60"
              label="3rd"
              medal="🥉"
            />
          </div>
        )}

        {/* Full leaderboard (everyone outside top 3) */}
        {runnersUp.length > 0 && (
          <Card className="mb-6">
            <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-ink/55">
              Final scores
            </h2>
            <ScoreList
              scores={roomState.scores}
              players={roomState.players}
              selfId={userId}
            />
            <p className="mt-3 text-center font-heading text-[11px] uppercase tracking-wide text-ink/40">
              {roomState.settings.rounds} rounds played
            </p>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {isHost && code && (
            <Button
              variant="primary"
              size="lg"
              full
              onClick={handleRestart}
              disabled={restarting}
            >
              {restarting ? "Restarting…" : "🔁 Play Again"}
            </Button>
          )}
          {!isHost && (
            <Card className="text-center" elevation="sm">
              <p className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
                ⏳ Waiting for host…
              </p>
              <p className="mt-1 font-heading text-xs text-ink/40">
                they can start a new game from here
              </p>
            </Card>
          )}
          {restartError && (
            <p className="rounded-xl border-[3px] border-ink bg-pink px-3 py-2 text-center font-heading text-xs font-semibold">
              {restartError}
            </p>
          )}
          <Button variant="neutral" size="lg" full onClick={onLeave}>
            Leave Room
          </Button>
        </div>
      </div>
    </main>
  );
}

function PodiumColumn({
  rows,
  height,
  tint,
  label,
  medal,
  champion = false,
}: {
  rows: RankedRow[];
  height: string;
  tint: string;
  label: string;
  medal: string;
  champion?: boolean;
}) {
  const reduce = useReducedMotion();
  if (rows.length === 0) {
    return (
      <div className="flex flex-1 max-w-[8rem] flex-col items-center">
        <div className="mb-2 h-20 w-full" />
        <div
          className={`flex w-full items-center justify-center rounded-t-2xl border-[3px] border-ink ${tint} ${height} opacity-30`}
        >
          <span className="font-heading text-xs font-bold uppercase tracking-wide text-ink/40">
            —
          </span>
        </div>
        <span className="mt-1 font-heading text-[10px] font-bold uppercase tracking-wide text-ink/35">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 max-w-[7rem] flex-col items-center sm:max-w-[10rem]">
      <motion.div
        initial={reduce ? false : { y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 280,
          damping: 22,
          delay: champion ? 0.5 : 0.25,
        }}
        className="mb-2 flex flex-col items-center gap-1"
      >
        {champion && (
          <motion.span
            animate={
              reduce ? undefined : { rotate: [-4, 4, -4], y: [0, -2, 0] }
            }
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="text-3xl"
            aria-hidden="true"
          >
            👑
          </motion.span>
        )}
        <div className="relative">
          <span
            className={`block h-14 w-14 overflow-hidden rounded-full border-[3px] border-ink shadow-chunky-sm ${
              champion ? "ring-4 ring-sun ring-offset-2 ring-offset-cream" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl(rows[0]!.avatarSeed || rows[0]!.userId)}
              alt=""
              className="h-full w-full bg-cream"
            />
          </span>
          <span className="absolute -bottom-1 -right-1 text-2xl">{medal}</span>
        </div>
        <span className="max-w-[8rem] truncate font-heading text-xs font-bold uppercase tracking-wide">
          {rows[0]!.name}
          {rows.length > 1 && (
            <span className="ml-1 text-ink/55">+{rows.length - 1}</span>
          )}
        </span>
      </motion.div>

      <motion.div
        initial={reduce ? false : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{
          type: "spring",
          stiffness: 240,
          damping: 26,
          delay: champion ? 0.35 : 0.15,
        }}
        style={{ transformOrigin: "bottom" }}
        className={`flex w-full items-center justify-center rounded-t-2xl border-[3px] border-ink ${tint} ${height} shadow-chunky-sm`}
      >
        <span className="font-heading text-2xl font-extrabold tabular-nums">
          {rows[0]!.score}
        </span>
      </motion.div>
      <span className="mt-1 font-heading text-[10px] font-bold uppercase tracking-wide text-ink/55">
        {label}
      </span>
    </div>
  );
}
