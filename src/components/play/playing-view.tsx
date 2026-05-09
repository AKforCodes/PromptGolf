"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Attempt, Player, RoomState } from "@/lib/types";
import {
  ApiError,
  getRoundDetails,
  pickAttempt,
  submitGeneration,
} from "@/lib/api";
import { tryCatch } from "@/lib/result";
import { getPusher } from "@/lib/pusher-client";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { findCategory } from "@/lib/room-constants";
import { usePhaseCountdown } from "./use-phase-countdown";

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
  const {
    settings,
    currentRound,
    players,
    targetImageUrl,
    hostId,
    phaseEndsAt,
  } = roomState;

  // Identity gates. Game has started — derive once and reuse.
  const isHost = userId === hostId;
  const nonHostPlayers = players.filter((p) => p.userId !== hostId);
  const meAsNonHost = nonHostPlayers.find((p) => p.userId === userId);
  // A non-host with role !== "spectator" is a prompter (they submit prompts).
  const isPrompter = !isHost && meAsNonHost?.role === "prompter";
  const isSpectator = !isHost && meAsNonHost?.role === "spectator";

  // Server-driven countdown. Memorize and prompt are sub-phases of `playing`:
  // total = memorizeTime + timer. While remaining > timer we're memorizing;
  // otherwise we're prompting. Auto-advance is handled at the page level.
  const totalSecondsLeft = usePhaseCountdown(phaseEndsAt);
  const inMemorize = totalSecondsLeft > settings.timer;
  const secondsLeft = inMemorize
    ? Math.max(0, totalSecondsLeft - settings.timer)
    : totalSecondsLeft;
  const phaseTotal = inMemorize ? settings.memorizeTime : settings.timer;
  const barPct = phaseTotal > 0 ? (secondsLeft / phaseTotal) * 100 : 0;
  const barColor = inMemorize ? "bg-sky" : "bg-golf";
  const timeOut = !inMemorize && totalSecondsLeft === 0;

  // Local state — round-scoped. PlayingView is keyed on currentRound at the
  // parent so every round mounts a fresh component; no reset effect needed.
  const [prompt, setPrompt] = useState<string>("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  // userId → count for the player strip. Updated from every attempt-submitted
  // broadcast (not just the caller's). Caller's own count is also derivable
  // from `attempts.length` but this map is simpler for the strip render.
  const [submissionCounts, setSubmissionCounts] = useState<
    Record<string, number>
  >({});

  // Initial load: fetch the caller's existing attempts + pick from the round
  // endpoint. Covers fresh rounds (empty) and refresh mid-round.
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
      setPickedId(data.myPick);
      // Seed self count from initial fetch — others will be backfilled by
      // Pusher events as they happen.
      setSubmissionCounts((prev) => ({
        ...prev,
        [userId]: data.myAttempts.length,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [code, currentRound, userId]);

  // Listen for all attempt-submitted broadcasts. Pusher.subscribe is
  // idempotent — we share the channel with the parent page.
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
      // Append directly so the user sees feedback even before the Pusher
      // event lands; the channel handler dedupes by id.
      setAttempts((prev) =>
        prev.some((x) => x.id === data.attempt.id)
          ? prev
          : [...prev, data.attempt]
      );
      setPrompt("");
    },
    [canSubmit, code, prompt]
  );

  const handlePick = useCallback(
    async (attemptId: string) => {
      // Optimistic update; rollback on failure.
      const prev = pickedId;
      setPickError(null);
      setPickedId(attemptId);
      const [err] = await tryCatch(pickAttempt(code, attemptId));
      if (err) {
        setPickedId(prev);
        setPickError(err instanceof ApiError ? err.message : "Pick failed");
      }
    },
    [code, pickedId]
  );

  // Players strip shows non-host prompters only — they're the ones submitting.
  const submittedPlayers = useMemo<Player[]>(
    () => nonHostPlayers.filter((p) => p.role === "prompter"),
    [nonHostPlayers]
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

        {/* Phase pill + timer */}
        <div className="mb-4 rounded-3xl border-[3px] border-ink bg-white p-3 shadow-chunky-sm">
          <div className="flex items-center justify-between gap-3">
            <span
              className={`rounded-full border-[3px] border-ink px-3 py-0.5 font-heading text-xs font-bold uppercase tracking-wide ${
                inMemorize ? "bg-sky" : "bg-sun"
              }`}
            >
              {inMemorize ? "Memorize" : "Prompt"}
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
        {inMemorize ? (
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
              {targetImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={targetImageUrl}
                  alt="Target image"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center">
                  <div className="text-6xl">🎨</div>
                  <p className="mt-3 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
                    target image loading…
                  </p>
                </div>
              )}
            </div>
          </Card>
        ) : (
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
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      if (submitError) setSubmitError(null);
                    }}
                    disabled={submitting || timeOut || remainingAttempts === 0}
                    placeholder={
                      remainingAttempts === 0
                        ? "no attempts remaining"
                        : "e.g. fox in the snow"
                    }
                    aria-label="Your prompt"
                    className="min-h-32 w-full resize-none rounded-2xl border-[3px] border-ink bg-cream px-5 py-4 font-heading text-2xl outline-none transition focus:bg-white disabled:opacity-60"
                    autoFocus
                  />

                  <div className="mt-3 flex items-center justify-between font-heading text-xs">
                    <span className={overCap ? "text-pink" : "text-ink/60"}>
                      {charCount} / {settings.promptMaxLength} chars
                    </span>
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
                    <p
                      role="alert"
                      className="mt-3 rounded-xl border-[3px] border-ink bg-pink px-3 py-2 text-center font-heading text-xs font-semibold"
                    >
                      {submitError}
                    </p>
                  )}
                </>
              )}
            </form>
          </Card>
        )}

        {/* Attempts grid (prompt phase only) */}
        {!inMemorize && !isSpectator && attempts.length > 0 && (
          <Card elevation="sm" className="mt-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
                Your attempts
              </h3>
              <span className="font-heading text-xs text-ink/50">
                pick one as your final
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {attempts.map((a) => {
                const picked = pickedId === a.id;
                return (
                  <div
                    key={a.id}
                    className={`flex flex-col overflow-hidden rounded-2xl border-[3px] ${
                      picked
                        ? "border-golf bg-golf/10"
                        : "border-ink bg-white"
                    }`}
                  >
                    <div className="aspect-square overflow-hidden border-b-[3px] border-ink bg-cream">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.imageUrl}
                        alt={a.prompt}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col gap-2 p-2">
                      <p className="line-clamp-2 font-heading text-xs">
                        {a.prompt}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {a.qualified && (
                            <span className="rounded-full border-2 border-ink bg-golf px-1.5 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
                              ✓
                            </span>
                          )}
                          <span
                            className={`rounded-full border-2 border-ink px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide ${
                              a.qualified ? "bg-golf" : "bg-pink"
                            }`}
                          >
                            {(a.similarity * 100).toFixed(1)}%
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant={picked ? "primary" : "secondary"}
                          size="sm"
                          onClick={() => handlePick(a.id)}
                          disabled={picked}
                        >
                          {picked ? "✓ Picked" : "Pick"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {pickError && (
              <p
                role="alert"
                className="mt-3 rounded-xl border-[3px] border-ink bg-pink px-3 py-2 text-center font-heading text-xs font-semibold"
              >
                {pickError}
              </p>
            )}
          </Card>
        )}

        {/* Player strip */}
        <Card elevation="sm" className="mt-4 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Players
            </h3>
            <span className="font-heading text-xs text-ink/50">
              {inMemorize ? "everyone is memorizing" : "live submissions"}
            </span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {submittedPlayers.map((p) => {
              const isYou = p.userId === userId;
              const submitted = submissionCounts[p.userId] ?? 0;
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
                    {inMemorize
                      ? "looking"
                      : `${submitted}/${settings.attemptsPerRound}`}
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
