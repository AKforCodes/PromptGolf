"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Player, RoomState } from "@/lib/types";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { findCategory } from "@/lib/room-constants";

interface PlayingViewProps {
  code: string;
  roomState: RoomState;
  userId: string;
  onLeave: () => void;
}

export function PlayingView({
  code,
  roomState,
  userId,
  onLeave,
}: PlayingViewProps) {
  const { settings, currentRound, players, targetId } = roomState;
  const isHost = roomState.hostId === userId;
  const isSpectator =
    players.find((p) => p.userId === userId)?.role === "spectator";

  const [prompt, setPrompt] = useState<string>("");
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(settings.timer);
  const startedAtRef = useRef<number>(Date.now());

  // Reset round-local state whenever the round number changes.
  useEffect(() => {
    setPrompt("");
    setSubmitted(false);
    setSecondsLeft(settings.timer);
    startedAtRef.current = Date.now();
  }, [currentRound, settings.timer]);

  // Local countdown. Server will become source of truth once it broadcasts
  // a round-start timestamp; until then, count from mount.
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - startedAtRef.current) / 1000
      );
      const remaining = Math.max(0, settings.timer - elapsed);
      setSecondsLeft(remaining);
    }, 250);
    return () => clearInterval(interval);
  }, [settings.timer]);

  const category = findCategory(settings.category);
  const charCount = prompt.length;
  const charPct = Math.min(100, (charCount / settings.promptMaxLength) * 100);
  const overCap = charCount > settings.promptMaxLength;
  const timeOut = secondsLeft === 0;
  const canSubmit =
    !submitted && !timeOut && !overCap && prompt.trim().length > 0 && !isSpectator;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    // TODO: wire to /api/v1/generate when image-gen endpoint lands
    console.log("Submit prompt (mock)", { code, round: currentRound, prompt });
    setSubmitted(true);
  };

  const submittedPlayers = useMemo<Player[]>(
    () => players.filter((p) => p.role === "prompter"),
    [players]
  );

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <Button variant="neutral" size="sm" onClick={onLeave}>
            ← Leave
          </Button>
          <div className="flex items-center gap-2">
            <span className="rounded-full border-[3px] border-ink bg-golf px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide">
              Round {currentRound} / {settings.rounds}
            </span>
            {category && (
              <span
                className="rounded-full border-[3px] border-ink px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide"
                style={{ backgroundColor: category.color }}
              >
                {category.emoji} {category.label}
              </span>
            )}
          </div>
        </div>

        {/* Timer */}
        <div className="mb-4 rounded-3xl border-[3px] border-ink bg-white p-3 shadow-chunky-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              time left
            </span>
            <span
              className={`font-heading text-3xl font-bold tabular-nums ${
                secondsLeft <= 10 && secondsLeft > 0
                  ? "text-pink"
                  : timeOut
                  ? "text-ink/40"
                  : ""
              }`}
            >
              {secondsLeft}s
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full border-[3px] border-ink bg-cream">
            <div
              className="h-full bg-golf transition-all duration-150"
              style={{
                width: `${(secondsLeft / settings.timer) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Target image */}
          <Card className="flex flex-col">
            <h2 className="mb-3 font-heading text-lg font-bold uppercase tracking-wide">
              Target
            </h2>
            <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-[3px] border-ink bg-cream">
              {targetId ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={targetId}
                  alt="Target image"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center">
                  <div className="text-6xl">🎨</div>
                  <p className="mt-3 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
                    target image loading…
                  </p>
                  <p className="mt-1 font-heading text-xs text-ink/40">
                    image-gen pipeline pending
                  </p>
                </div>
              )}
            </div>
            <p className="mt-3 text-center font-heading text-xs text-ink/50">
              recreate this with the shortest prompt
            </p>
          </Card>

          {/* Prompt input */}
          <Card>
            <form onSubmit={handleSubmit} className="flex h-full flex-col">
              <h2 className="mb-3 font-heading text-lg font-bold uppercase tracking-wide">
                Your Prompt
              </h2>

              {isSpectator ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/40 bg-cream p-6 text-center">
                  <div>
                    <div className="text-4xl">👀</div>
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
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={submitted || timeOut}
                    placeholder="e.g. fox in the snow"
                    aria-label="Your prompt"
                    className="min-h-32 w-full resize-none rounded-2xl border-[3px] border-ink bg-cream px-4 py-3 font-heading text-lg outline-none transition focus:bg-white disabled:opacity-60"
                    autoFocus
                  />

                  <div className="mt-2 flex items-center justify-between font-heading text-xs">
                    <span className={overCap ? "text-pink" : "text-ink/60"}>
                      {charCount} / {settings.promptMaxLength} chars
                    </span>
                    {submitted && (
                      <span className="rounded-full border-2 border-ink bg-golf px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        ✓ Submitted
                      </span>
                    )}
                    {timeOut && !submitted && (
                      <span className="rounded-full border-2 border-ink bg-pink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        Time up
                      </span>
                    )}
                  </div>

                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className={`h-full transition-all ${
                        overCap ? "bg-pink" : "bg-golf"
                      }`}
                      style={{ width: `${charPct}%` }}
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
                    {submitted
                      ? "Locked In"
                      : timeOut
                      ? "Time's up"
                      : overCap
                      ? "Too long"
                      : "Submit Prompt"}
                  </Button>
                </>
              )}
            </form>
          </Card>
        </div>

        {/* Submission status strip */}
        <Card elevation="sm" className="mt-4 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Players
            </h3>
            <span className="font-heading text-xs text-ink/50">
              waiting for submissions
            </span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {submittedPlayers.map((p) => {
              const isYou = p.userId === userId;
              return (
                <li
                  key={p.userId}
                  className="flex items-center gap-2 rounded-full border-2 border-ink bg-white px-3 py-1 font-heading text-xs"
                >
                  <span className="font-bold">
                    {p.name}
                    {isYou && <span className="ml-1 text-ink/50">(you)</span>}
                  </span>
                  {/* Submission status will hook into attempts list when /generate broadcasts */}
                  <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/60">
                    thinking…
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
