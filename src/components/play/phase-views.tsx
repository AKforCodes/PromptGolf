"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Attempt, RoomState, Vote } from "@/lib/types";
import { ApiError, getRoundDetails, restartRoom, submitVote } from "@/lib/api";
import { tryCatch } from "@/lib/result";
import { getPusher } from "@/lib/pusher-client";
import { useSoundEffect } from "@/components/sound-provider";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
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

function PhaseHeader({
  roomState,
  onLeave,
  pillLabel,
  pillBg,
}: PhaseProps & { pillLabel: string; pillBg: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <Button variant="neutral" size="sm" onClick={onLeave}>
        ← Leave
      </Button>
      <div className="flex items-center gap-2">
        <span className="rounded-full border-[3px] border-ink bg-golf px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide">
          Round {roomState.currentRound} / {roomState.settings.rounds}
        </span>
        <span
          className={`rounded-full border-[3px] border-ink px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide ${pillBg}`}
        >
          {pillLabel}
        </span>
      </div>
    </div>
  );
}

function CountdownStrip({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div className="mb-4 rounded-3xl border-[3px] border-ink bg-white p-3 shadow-chunky-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
          time left
        </span>
        <span
          className={`font-heading text-3xl font-bold tabular-nums ${
            secondsLeft <= 5 && secondsLeft > 0 ? "text-pink" : ""
          }`}
        >
          {secondsLeft}s
        </span>
      </div>
    </div>
  );
}

export function VotingView({
  code,
  roomState,
  userId,
  onLeave,
}: VotingPhaseProps) {
  const { playBubble } = useSoundEffect();
  const secondsLeft = usePhaseCountdown(roomState.phaseEndsAt);
  const { currentRound } = roomState;

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
    [finalAttempts, userId]
  );

  const myVote = useMemo(
    () => votes.find((v) => v.voterId === userId) ?? null,
    [votes, userId]
  );

  const playersById = useMemo(() => {
    const map: Record<string, { name: string }> = {};
    for (const p of roomState.players) map[p.userId] = { name: p.name };
    return map;
  }, [roomState.players]);

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

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-4xl">
        <PhaseHeader
          roomState={roomState}
          userId={userId}
          onLeave={onLeave}
          pillLabel="Vote"
          pillBg="bg-sun"
        />
        <CountdownStrip secondsLeft={secondsLeft} />

        <Card className="mb-4">
          <div className="mb-3 text-center">
            <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
              Pick your favourite
            </h2>
            <p className="mt-1 font-heading text-xs text-ink/50">
              tap an image to vote — you can change your mind until the timer
              ends
            </p>
          </div>

          {loading ? (
            <p className="text-center font-heading text-sm text-ink/50">
              loading attempts…
            </p>
          ) : votableAttempts.length === 0 ? (
            <p className="text-center font-heading text-sm text-ink/50">
              no attempts to vote on this round
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {votableAttempts.map((a) => {
                const author = playersById[a.userId]?.name ?? "Player";
                const selected = myVote?.targetId === a.userId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleVote(a.userId)}
                    disabled={voteBusy}
                    aria-pressed={selected}
                    className={`press flex flex-col rounded-2xl border-[3px] border-ink p-2 text-left shadow-chunky-sm cursor-pointer disabled:cursor-not-allowed ${
                      selected ? "bg-golf" : "bg-cream hover:bg-white"
                    }`}
                  >
                    <div className="aspect-square overflow-hidden rounded-xl border-[3px] border-ink bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.imageUrl}
                        alt={`Attempt by ${author}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-heading text-xs font-bold uppercase tracking-wide">
                        by {author}
                      </span>
                      {selected && (
                        <span className="rounded-full border-2 border-ink bg-white px-1.5 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
                          ✓ Voted
                        </span>
                      )}
                    </div>
                    <p
                      className="mt-1 truncate font-heading text-xs text-ink/70"
                      title={a.prompt}
                    >
                      {a.prompt}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {voteError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border-[3px] border-ink bg-pink px-4 py-2 text-center font-heading text-sm font-semibold"
            >
              {voteError}
            </p>
          )}
        </Card>

        {/* Target image reference */}
        {targetImageUrl && (
          <Card className="mb-4">
            <h3 className="mb-3 text-center font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              the image they were trying to recreate
            </h3>
            <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl border-[3px] border-ink bg-cream">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={targetImageUrl}
                alt="Target image"
                className="h-full w-full object-cover"
              />
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}

function ScoreList({
  scores,
  players,
}: {
  scores: Record<string, number>;
  players: RoomState["players"];
}) {
  const rows = players
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      score: scores[p.userId] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  // Competition ranking ("1224"): tied scores share the same rank,
  // next different score gets rank = index + 1.
  let prevRank = 0
  let prevScore: number | undefined
  const ranks = rows.map((r, i) => {
    const rank =
      prevScore !== undefined && r.score === prevScore ? prevRank : i + 1
    prevScore = r.score
    prevRank = rank
    return { ...r, rank }
  })

  return (
    <ol className="flex flex-col gap-2">
      {ranks.map((r) => (
        <li
          key={r.userId}
          className="flex items-center justify-between rounded-2xl border-[3px] border-ink bg-cream px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <span className="font-heading text-lg font-bold tabular-nums">
              #{r.rank}
            </span>
            <span className="font-heading text-base font-semibold">
              {r.name}
            </span>
          </div>
          <span className="font-heading text-xl font-bold tabular-nums">
            {r.score}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function RevealView({ roomState, userId, onLeave }: PhaseProps) {
  const secondsLeft = usePhaseCountdown(roomState.phaseEndsAt);

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <PhaseHeader
          roomState={roomState}
          userId={userId}
          onLeave={onLeave}
          pillLabel="Reveal"
          pillBg="bg-pink"
        />
        <CountdownStrip secondsLeft={secondsLeft} />

        <Card className="mb-4">
          <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
            The secret prompt was
          </h2>
          <p className="font-heading text-2xl font-bold leading-snug">
            {roomState.targetPrompt ?? "(hidden)"}
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 font-heading text-lg font-bold uppercase tracking-wide">
            Leaderboard
          </h2>
          <ScoreList scores={roomState.scores} players={roomState.players} />
        </Card>
      </div>
    </main>
  );
}

export function EndedView({ roomState, userId, onLeave, code }: PhaseProps) {
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

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <PhaseHeader
          roomState={roomState}
          userId={userId}
          onLeave={onLeave}
          pillLabel="Final"
          pillBg="bg-golf"
        />

        <Card className="mb-4 text-center">
          <div className="mb-2 text-6xl">🏆</div>
          <h2 className="font-heading text-3xl font-bold uppercase tracking-wide">
            Game over
          </h2>
          <p className="mt-1 font-heading text-sm text-ink/60">
            {roomState.settings.rounds} rounds played
          </p>
        </Card>

        <Card className="mb-6">
          <h2 className="mb-3 font-heading text-lg font-bold uppercase tracking-wide">
            Final scores
          </h2>
          <ScoreList scores={roomState.scores} players={roomState.players} />
        </Card>

        <div className="flex flex-col gap-3">
          {isHost && code && (
            <Button
              variant="primary"
              size="lg"
              full
              onClick={handleRestart}
              disabled={restarting}
            >
              {restarting ? "Restarting…" : "Play Again"}
            </Button>
          )}
          {!isHost && (
            <p className="text-center font-heading text-sm text-ink/60">
              Waiting for host to start a new game…
            </p>
          )}
          {restartError && (
            <p className="rounded-xl border-[3px] border-ink bg-pink px-3 py-2 text-center font-heading text-xs font-semibold">
              {restartError}
            </p>
          )}
          <Button variant="neutral" size="lg" full onClick={onLeave}>
            Leave
          </Button>
        </div>
      </div>
    </main>
  );
}
