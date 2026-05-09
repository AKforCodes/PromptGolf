"use client";

import type { RoomSettings } from "@/lib/types";
import { findCategory, findDifficulty } from "@/lib/room-constants";
import { Card } from "@/components/jklm/card";

interface RoundSummaryCardProps {
  settings: RoomSettings;
}

export function RoundSummaryCard({ settings }: RoundSummaryCardProps) {
  const category = findCategory(settings.category);
  const difficulty = findDifficulty(settings.difficulty);

  return (
    <Card className="mb-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
          Round Settings
        </h2>
        <span className="rounded-full border-[3px] border-ink bg-golf px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
          Showdown
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          className="col-span-2 rounded-2xl border-[3px] border-ink p-3 shadow-chunky-sm"
          style={{ backgroundColor: category?.color ?? "#FFF8E7" }}
        >
          <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/60">
            Category
          </div>
          <div className="mt-1 font-heading text-lg font-bold">
            <span aria-hidden="true">{category?.emoji} </span>
            {category?.label ?? settings.category}
          </div>
        </div>

        <div className="rounded-2xl border-[3px] border-ink bg-sky p-3 shadow-chunky-sm">
          <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/60">
            Rounds
          </div>
          <div className="mt-1 font-heading text-2xl font-bold">
            {settings.rounds}
          </div>
        </div>

        <div className="rounded-2xl border-[3px] border-ink bg-sun p-3 shadow-chunky-sm">
          <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/60">
            Round timer
          </div>
          <div className="mt-1 font-heading text-2xl font-bold">
            {settings.timer}s
          </div>
        </div>

        <div className="rounded-2xl border-[3px] border-ink bg-pink p-3 shadow-chunky-sm">
          <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/60">
            Prompt cap
          </div>
          <div className="mt-1 font-heading text-2xl font-bold">
            {settings.promptMaxLength}
          </div>
          <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/60">
            chars
          </div>
        </div>

        <div
          className="rounded-2xl border-[3px] border-ink p-3 shadow-chunky-sm"
          style={{ backgroundColor: difficulty?.color ?? "#FFF8E7" }}
        >
          <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/60">
            Difficulty
          </div>
          <div className="mt-1 font-heading text-lg font-bold uppercase tracking-wide">
            {difficulty?.label ?? settings.difficulty}
          </div>
        </div>
      </div>

      <p className="mt-4 text-center font-heading text-xs text-ink/50">
        host picks the round settings
      </p>
    </Card>
  );
}
