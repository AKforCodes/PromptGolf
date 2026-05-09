"use client";

import type { RoomState } from "@/lib/types";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { usePhaseCountdown } from "./use-phase-countdown";

interface PhaseProps {
  roomState: RoomState;
  userId: string;
  onLeave: () => void;
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

export function GeneratingView({ roomState, userId, onLeave }: PhaseProps) {
  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <PhaseHeader
          roomState={roomState}
          userId={userId}
          onLeave={onLeave}
          pillLabel="Loading"
          pillBg="bg-sky"
        />
        <Card className="flex flex-col items-center py-16 text-center">
          <div className="mb-4 text-6xl">🎨</div>
          <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
            Generating round target…
          </h2>
          <p className="mt-2 font-heading text-sm text-ink/60">
            FLUX is painting · CLIP is measuring · hold tight
          </p>
        </Card>
      </div>
    </main>
  );
}

export function VotingView({ roomState, userId, onLeave }: PhaseProps) {
  const secondsLeft = usePhaseCountdown(roomState.phaseEndsAt);

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <PhaseHeader
          roomState={roomState}
          userId={userId}
          onLeave={onLeave}
          pillLabel="Vote"
          pillBg="bg-sun"
        />
        <CountdownStrip secondsLeft={secondsLeft} />
        <Card className="text-center">
          <div className="mb-4 text-5xl">🗳️</div>
          <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
            Voting carousel
          </h2>
          <p className="mt-2 font-heading text-sm text-ink/60">
            full voting UI lands next — the round will auto-advance when the
            timer hits zero
          </p>
        </Card>
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

  return (
    <ol className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <li
          key={r.userId}
          className="flex items-center justify-between rounded-2xl border-[3px] border-ink bg-cream px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <span className="font-heading text-lg font-bold tabular-nums">
              #{i + 1}
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

export function EndedView({ roomState, userId, onLeave }: PhaseProps) {
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

        <Button variant="primary" size="lg" full onClick={onLeave}>
          Back to start
        </Button>
      </div>
    </main>
  );
}
