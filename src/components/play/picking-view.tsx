"use client";

import { useCallback, useEffect, useState } from "react";
import type { Attempt, RoomState } from "@/lib/types";
import { ApiError, getRoundDetails, pickAttempt } from "@/lib/api";
import { tryCatch } from "@/lib/result";
import { useSoundEffect } from "@/components/sound-provider";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { findCategory } from "@/lib/room-constants";
import { usePhaseCountdown } from "./use-phase-countdown";

interface PickingViewProps {
  code: string;
  roomState: RoomState;
  userId: string;
  onLeave: () => void;
}

export function PickingView({
  code,
  roomState,
  userId,
  onLeave,
}: PickingViewProps) {
  const { playBubble } = useSoundEffect();
  const { settings, currentRound, players, hostId, targetImageUrl } = roomState;
  const secondsLeft = usePhaseCountdown(roomState.phaseEndsAt);
  const category = findCategory(settings.category);

  const isHost = userId === hostId;
  const me = players.find((p) => p.userId === userId);
  const isSpectator = !isHost && me?.role === "spectator";

  const [myAttempts, setMyAttempts] = useState<Attempt[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState<boolean>(false);

  // Initial fetch — myAttempts + current pick.
  // Retries once after 1.5s if the result is empty, as a safety net against
  // a brief Redis read-after-write inconsistency.
  useEffect(() => {
    if (currentRound < 1) return;
    let cancelled = false;
    void (async () => {
      const [err, data] = await tryCatch(getRoundDetails(code, currentRound));
      if (cancelled) return;
      if (err) {
        console.error("getRoundDetails failed:", err);
        setLoading(false);
        return;
      }
      if (data.myAttempts.length === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        if (cancelled) return;
        const [retryErr, retryData] = await tryCatch(getRoundDetails(code, currentRound));
        if (retryErr) {
          console.error("getRoundDetails retry failed:", retryErr);
        } else {
          setMyAttempts(retryData.myAttempts);
          setPickedId(retryData.myPick);
          setLoading(false);
          return;
        }
      }
      setMyAttempts(data.myAttempts);
      setPickedId(data.myPick);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [code, currentRound]);

  const handlePick = useCallback(
    async (attemptId: string) => {
      if (pickBusy) return;
      playBubble();
      const prev = pickedId;
      setPickError(null);
      setPickBusy(true);
      setPickedId(attemptId); // optimistic
      const [err] = await tryCatch(pickAttempt(code, attemptId));
      setPickBusy(false);
      if (err) {
        setPickedId(prev);
        setPickError(err instanceof ApiError ? err.message : "Pick failed");
      }
    },
    [code, pickBusy, pickedId]
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
            <span className="rounded-full border-[3px] border-ink bg-pink px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide">
              Pick
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
              time left to pick
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

        {/* Target reference */}
        {targetImageUrl && (
          <Card className="mb-4">
            <h3 className="mb-3 text-center font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              the image you tried to recreate
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

        {/* Picking grid */}
        <Card>
          <div className="mb-3 text-center">
            <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
              Pick your favourite
            </h2>
            <p className="mt-1 font-heading text-xs text-ink/50">
              tap an image — voting starts when the timer hits zero
            </p>
          </div>

          {isSpectator ? (
            <div className="flex items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/40 bg-cream p-6 text-center">
              <div>
                <div className="text-4xl">👀</div>
                <p className="mt-2 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
                  spectating · players are picking
                </p>
              </div>
            </div>
          ) : loading ? (
            <p className="text-center font-heading text-sm text-ink/50">
              loading attempts…
            </p>
          ) : myAttempts.length === 0 ? (
            <div className="flex items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/40 bg-cream p-6 text-center">
              <p className="font-heading text-sm text-ink/50">
                no attempts to pick from — looks like you didn&apos;t submit any
                this round
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myAttempts.map((a, idx) => {
                const selected = pickedId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handlePick(a.id)}
                    disabled={pickBusy}
                    aria-pressed={selected}
                    className={`press flex flex-col rounded-2xl border-[3px] border-ink p-2 text-left shadow-chunky-sm cursor-pointer disabled:cursor-not-allowed ${
                      selected ? "bg-golf" : "bg-cream hover:bg-white"
                    }`}
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
                      <div className="flex items-center gap-1">
                        <span className="rounded-full border-2 border-ink bg-white px-1.5 py-0.5">
                          {a.chars}c
                        </span>
                        {selected && (
                          <span className="rounded-full border-2 border-ink bg-white px-1.5 py-0.5">
                            ✓ Picked
                          </span>
                        )}
                      </div>
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

          {pickError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border-[3px] border-ink bg-pink px-4 py-2 text-center font-heading text-sm font-semibold"
            >
              {pickError}
            </p>
          )}

          {!isSpectator && myAttempts.length > 0 && !pickedId && (
            <p className="mt-3 text-center font-heading text-xs text-ink/50">
              if you don&apos;t pick, your last submission is used automatically
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
