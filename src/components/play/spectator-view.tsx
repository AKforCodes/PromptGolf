"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Attempt, RoomState } from "@/lib/types";
import { getRoundDetails } from "@/lib/api";
import { tryCatch } from "@/lib/result";
import { getPusher } from "@/lib/pusher-client";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { findCategory } from "@/lib/room-constants";
import { usePhaseCountdown } from "./use-phase-countdown";

interface SpectatorViewProps {
  code: string;
  roomState: RoomState;
  userId: string;
  onLeave: () => void;
}

export function SpectatorView({
  code,
  roomState,
  userId,
  onLeave,
}: SpectatorViewProps) {
  const { settings, currentRound, players, hostId, targetImageUrl } = roomState;
  const secondsLeft = usePhaseCountdown(roomState.phaseEndsAt);
  const category = findCategory(settings.category);

  // Prompters spectators can browse — host is included since they also play.
  const prompters = useMemo(
    () => players.filter((p) => p.role === "prompter"),
    [players]
  );
  // hostId still extracted for parity with other views; not used for filtering.
  void hostId;

  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [attemptsByUser, setAttemptsByUser] = useState<
    Record<string, Attempt[]>
  >({});

  // Clamp index if the prompter list changes (someone leaves).
  useEffect(() => {
    if (selectedIdx >= prompters.length && prompters.length > 0) {
      setSelectedIdx(0);
    }
  }, [prompters.length, selectedIdx]);

  // Initial baseline: round endpoint returns finalAttempts (one per player).
  // Better than nothing if the spectator joined mid-round.
  useEffect(() => {
    if (currentRound < 1) return;
    let cancelled = false;
    void (async () => {
      const [err, data] = await tryCatch(getRoundDetails(code, currentRound));
      if (cancelled || err) return;
      const seeded: Record<string, Attempt[]> = {};
      for (const a of data.finalAttempts) {
        seeded[a.userId] = [a];
      }
      setAttemptsByUser((prev) => ({ ...seeded, ...prev }));
    })();
    return () => {
      cancelled = true;
    };
  }, [code, currentRound]);

  // Live attempts via Pusher. The channel broadcasts every attempt-submitted
  // to all subscribers, so we accumulate per-user.
  useEffect(() => {
    const pusher = getPusher();
    const channel = pusher.subscribe(`presence-room-${code}`);
    const onAttempt = (a: Attempt) => {
      setAttemptsByUser((prev) => {
        const list = prev[a.userId] ?? [];
        if (list.some((x) => x.id === a.id)) return prev;
        return { ...prev, [a.userId]: [...list, a] };
      });
    };
    channel.bind("attempt-submitted", onAttempt);
    return () => {
      channel.unbind("attempt-submitted", onAttempt);
    };
  }, [code]);

  // Reset accumulated attempts on round change.
  useEffect(() => {
    setAttemptsByUser({});
  }, [currentRound]);

  const selected = prompters[selectedIdx] ?? null;
  const selectedAttempts = selected
    ? attemptsByUser[selected.userId] ?? []
    : [];

  const goLeft = useCallback(() => {
    if (prompters.length === 0) return;
    setSelectedIdx((i) => (i - 1 + prompters.length) % prompters.length);
  }, [prompters.length]);

  const goRight = useCallback(() => {
    if (prompters.length === 0) return;
    setSelectedIdx((i) => (i + 1) % prompters.length);
  }, [prompters.length]);

  // Keyboard navigation for desktop spectators.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goLeft();
      else if (e.key === "ArrowRight") goRight();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goLeft, goRight]);

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <Button variant="neutral" size="sm" onClick={onLeave}>
            ← Leave
          </Button>
          <div className="flex items-center gap-2">
            <span className="rounded-full border-[3px] border-ink bg-sky px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide">
              👀 Spectating
            </span>
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
                secondsLeft <= 5 && secondsLeft > 0 ? "text-pink" : ""
              }`}
            >
              {secondsLeft}s
            </span>
          </div>
        </div>

        {/* Target image — spectators see it the whole time */}
        {targetImageUrl && (
          <Card className="mb-4">
            <h3 className="mb-3 text-center font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              target image
            </h3>
            <div className="mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl border-[3px] border-ink bg-cream">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={targetImageUrl}
                alt="Target image"
                className="h-full w-full object-cover"
              />
            </div>
          </Card>
        )}

        {/* Player carousel */}
        {prompters.length === 0 ? (
          <Card className="text-center">
            <p className="font-heading text-sm text-ink/50">
              no prompters in this room
            </p>
          </Card>
        ) : (
          <Card>
            {/* Arrows + name */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={goLeft}
                aria-label="previous player"
                className="press flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-ink bg-white font-heading text-2xl font-bold cursor-pointer disabled:cursor-not-allowed shadow-chunky-sm"
                disabled={prompters.length < 2}
              >
                ←
              </button>

              <div className="flex flex-1 flex-col items-center px-2 text-center">
                <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/50">
                  watching
                </span>
                <span
                  className="font-heading text-2xl font-bold uppercase tracking-wide"
                  title={selected?.name}
                >
                  {selected?.name ?? "—"}
                </span>
                {prompters.length > 1 && (
                  <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/40">
                    {selectedIdx + 1} / {prompters.length} · ← → to switch
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={goRight}
                aria-label="next player"
                className="press flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-ink bg-white font-heading text-2xl font-bold cursor-pointer disabled:cursor-not-allowed shadow-chunky-sm"
                disabled={prompters.length < 2}
              >
                →
              </button>
            </div>

            {/* Quick switcher pills */}
            {prompters.length > 1 && (
              <div className="mb-4 flex flex-wrap justify-center gap-1">
                {prompters.map((p, i) => {
                  const active = i === selectedIdx;
                  const count = attemptsByUser[p.userId]?.length ?? 0;
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      onClick={() => setSelectedIdx(i)}
                      className={`rounded-full border-2 border-ink px-3 py-1 font-heading text-[10px] font-bold uppercase tracking-wide cursor-pointer ${
                        active ? "bg-golf" : "bg-white"
                      }`}
                    >
                      {p.name} · {count}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Attempts feed for selected player */}
            {selectedAttempts.length === 0 ? (
              <p className="text-center font-heading text-sm text-ink/50 py-6">
                no submissions yet from {selected?.name ?? "this player"}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectedAttempts.map((a, idx) => (
                  <div
                    key={a.id}
                    className="rounded-2xl border-[3px] border-ink bg-cream p-2 shadow-chunky-sm"
                  >
                    <div className="aspect-square overflow-hidden rounded-xl border-[3px] border-ink bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.imageUrl}
                        alt={`Attempt ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between font-heading text-[10px] font-bold uppercase tracking-wide">
                      <span>#{idx + 1}</span>
                      <span className="rounded-full border-2 border-ink bg-white px-1.5 py-0.5">
                        {a.chars}c
                      </span>
                    </div>
                    <p
                      className="mt-1 truncate font-heading text-xs text-ink/70"
                      title={a.prompt}
                    >
                      {a.prompt}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-4 text-center font-heading text-[10px] uppercase tracking-wide text-ink/40">
              spectator · userId {userId.slice(0, 6)}
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
