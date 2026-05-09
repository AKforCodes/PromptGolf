"use client";

import type { RoomState } from "@/lib/types";
import { Card } from "@/components/jklm/card";
import { Button } from "@/components/jklm/button";
import { findCategory } from "@/lib/room-constants";

interface RoundLoadingViewProps {
  roomState: RoomState;
  onLeave: () => void;
}

export function RoundLoadingView({ roomState, onLeave }: RoundLoadingViewProps) {
  const { settings, currentRound } = roomState;
  const category = findCategory(settings.category);

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <Button variant="neutral" size="sm" onClick={onLeave}>
            ← Leave
          </Button>
          <span className="rounded-full border-[3px] border-ink bg-golf px-3 py-1 font-heading text-xs font-bold uppercase tracking-wide">
            Round {currentRound} / {settings.rounds}
          </span>
        </div>

        <Card className="text-center">
          <div className="my-2 text-7xl" aria-hidden="true">
            {category?.emoji ?? "🎨"}
          </div>
          <h1 className="font-heading text-3xl font-bold uppercase tracking-tight sm:text-4xl">
            Generating round…
          </h1>
          <p className="mt-2 font-heading text-sm text-ink/60">
            picking a target image and warming up the AI
          </p>

          {category && (
            <div className="mt-5 flex justify-center">
              <span
                className="rounded-full border-[3px] border-ink px-4 py-1 font-heading text-sm font-bold uppercase tracking-wide"
                style={{ backgroundColor: category.color }}
              >
                {category.emoji} {category.label}
              </span>
            </div>
          )}

          {/* Indeterminate progress bar */}
          <div className="mx-auto mt-6 h-3 w-full max-w-md overflow-hidden rounded-full border-[3px] border-ink bg-cream">
            <div className="loading-stripes h-full bg-golf" />
          </div>

          <p className="mt-4 font-heading text-xs text-ink/40">
            this usually takes a few seconds
          </p>
        </Card>

        <style jsx>{`
          .loading-stripes {
            background-image: linear-gradient(
              45deg,
              rgba(255, 255, 255, 0.4) 25%,
              transparent 25%,
              transparent 50%,
              rgba(255, 255, 255, 0.4) 50%,
              rgba(255, 255, 255, 0.4) 75%,
              transparent 75%,
              transparent
            );
            background-size: 24px 24px;
            animation: stripes 1s linear infinite;
          }
          @keyframes stripes {
            0% {
              background-position: 0 0;
            }
            100% {
              background-position: 24px 0;
            }
          }
        `}</style>
      </div>
    </main>
  );
}
