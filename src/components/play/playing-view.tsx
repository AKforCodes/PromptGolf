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

type LocalPhase = "memorize" | "prompting";

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

  const [localPhase, setLocalPhase] = useState<LocalPhase>("memorize");
  const [secondsLeft, setSecondsLeft] = useState<number>(settings.memorizeTime);
  const [prompt, setPrompt] = useState<string>("");
  const [submitted, setSubmitted] = useState<boolean>(false);
  const phaseStartedAtRef = useRef<number>(Date.now());

  // Reset everything whenever the round number changes.
  useEffect(() => {
    setLocalPhase("memorize");
    setSecondsLeft(settings.memorizeTime);
    setPrompt("");
    setSubmitted(false);
    phaseStartedAtRef.current = Date.now();
  }, [currentRound]);

  // Reset the phase clock whenever localPhase changes (memorize → prompting).
  useEffect(() => {
    phaseStartedAtRef.current = Date.now();
    setSecondsLeft(
      localPhase === "memorize" ? settings.memorizeTime : settings.timer
    );
  }, [localPhase, settings.timer]);

  // Tick the countdown. When memorize hits zero, advance to prompting.
  useEffect(() => {
    const total =
      localPhase === "memorize" ? settings.memorizeTime : settings.timer;

    const interval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - phaseStartedAtRef.current) / 1000
      );
      const remaining = Math.max(0, total - elapsed);
      setSecondsLeft(remaining);

      if (remaining === 0 && localPhase === "memorize") {
        setLocalPhase("prompting");
      }
    }, 250);

    return () => clearInterval(interval);
  }, [localPhase, settings.timer]);

  const category = findCategory(settings.category);
  const charCount = prompt.length;
  const charPct = Math.min(100, (charCount / settings.promptMaxLength) * 100);
  const overCap = charCount > settings.promptMaxLength;
  const timeOut = localPhase === "prompting" && secondsLeft === 0;
  const canSubmit =
    localPhase === "prompting" &&
    !submitted &&
    !timeOut &&
    !overCap &&
    prompt.trim().length > 0 &&
    !isSpectator;

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

  const totalForBar =
    localPhase === "memorize" ? settings.memorizeTime : settings.timer;
  const barPct = (secondsLeft / totalForBar) * 100;
  const barColor = localPhase === "memorize" ? "bg-sky" : "bg-golf";

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

        {/* Phase pill + timer */}
        <div className="mb-4 rounded-3xl border-[3px] border-ink bg-white p-3 shadow-chunky-sm">
          <div className="flex items-center justify-between gap-3">
            <span
              className={`rounded-full border-[3px] border-ink px-3 py-0.5 font-heading text-xs font-bold uppercase tracking-wide ${
                localPhase === "memorize" ? "bg-sky" : "bg-sun"
              }`}
            >
              {localPhase === "memorize" ? "Memorize" : "Prompt"}
            </span>
            <span
              className={`font-heading text-3xl font-bold tabular-nums ${
                secondsLeft <= 5 && secondsLeft > 0
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
              className={`h-full transition-all duration-150 ${barColor}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
        </div>

        {/* Phase body */}
        {localPhase === "memorize" ? (
          <Card className="flex flex-col">
            <div className="mb-3 text-center">
              <h2 className="font-heading text-xl font-bold uppercase tracking-wide">
                Memorize the image
              </h2>
              <p className="mt-1 font-heading text-xs text-ink/50">
                it will disappear when the timer runs out
              </p>
            </div>
            <div className="relative mx-auto flex aspect-square w-full max-w-xl items-center justify-center overflow-hidden rounded-2xl border-[3px] border-ink bg-cream">
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
          </Card>
        ) : (
          <Card>
            <form onSubmit={handleSubmit} className="flex h-full flex-col">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-heading text-xl font-bold uppercase tracking-wide">
                  Your Prompt
                </h2>
                <span className="font-heading text-xs uppercase tracking-wide text-ink/50">
                  recreate from memory
                </span>
              </div>

              {isSpectator ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/40 bg-cream p-8 text-center">
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
                    className="min-h-40 w-full resize-none rounded-2xl border-[3px] border-ink bg-cream px-5 py-4 font-heading text-2xl outline-none transition focus:bg-white disabled:opacity-60"
                    autoFocus
                  />

                  <div className="mt-3 flex items-center justify-between font-heading text-xs">
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
        )}

        {/* Player strip */}
        <Card elevation="sm" className="mt-4 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Players
            </h3>
            <span className="font-heading text-xs text-ink/50">
              {localPhase === "memorize"
                ? "everyone is memorizing"
                : "waiting for submissions"}
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
                  <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/60">
                    {localPhase === "memorize" ? "looking" : "thinking…"}
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
