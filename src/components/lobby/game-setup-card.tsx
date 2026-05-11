"use client";

import type { RoomSettings } from "@/lib/types";
import {
  CATEGORIES,
  DIFFICULTIES,
  MAX_ATTEMPTS,
  MAX_MEMORIZE,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MAX_TIMER,
  MEMORIZE_STEP,
  MIN_ATTEMPTS,
  MIN_MEMORIZE,
  MIN_PLAYERS,
  MIN_ROUNDS,
  MIN_TIMER,
  PROMPT_LEN_OPTIONS,
  TIMER_STEP,
} from "@/lib/room-constants";
import { useSoundEffect } from "@/components/sound-provider";
import { Card } from "@/components/jklm/card";
import { Stepper } from "@/components/jklm/stepper";

interface GameSetupCardProps {
  settings: RoomSettings;
  onChange: <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) => void;
  /** When true, renders without the outer Card wrapper / heading row.
   *  Use when nesting inside another Card/panel to avoid double borders. */
  bare?: boolean;
}

export function GameSetupCard({ settings, onChange, bare = false }: GameSetupCardProps) {
  const { playBubble } = useSoundEffect();
  const Wrapper: React.ElementType = bare ? "div" : Card;
  const wrapperProps = bare ? {} : { className: "mb-6" };
  return (
    <Wrapper {...wrapperProps}>
      {!bare && (
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
            Game Setup
          </h2>
          <span className="rounded-full border-[3px] border-ink bg-golf px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
            Showdown
          </span>
        </div>
      )}

      {/* Category */}
      <fieldset className="mb-6">
        <legend className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
          Category
        </legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const selected = settings.category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { playBubble(); onChange("category", c.id); }}
                aria-pressed={selected}
                className={`press inline-flex items-center gap-2 rounded-full border-[3px] border-ink px-4 py-2 font-heading text-sm font-bold uppercase tracking-wide cursor-pointer ${
                  selected ? "shadow-chunky-sm" : "bg-white opacity-70 hover:opacity-100"
                }`}
                style={selected ? { backgroundColor: c.color } : undefined}
              >
                <span aria-hidden="true">{c.emoji}</span>
                <span>{c.label}</span>
                {selected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Steppers + segment */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <fieldset>
          <div className="mb-2 flex items-baseline justify-between">
            <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Rounds
            </legend>
            <span className="font-heading text-xs text-ink/50">
              {MIN_ROUNDS}–{MAX_ROUNDS}
            </span>
          </div>
          <Stepper
            value={settings.rounds}
            min={MIN_ROUNDS}
            max={MAX_ROUNDS}
            ariaLabel="rounds"
            fillColor="#38BDF8"
            onChange={(n) => onChange("rounds", n)}
          />
        </fieldset>

        <fieldset>
          <div className="mb-2 flex items-baseline justify-between">
            <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Max players
            </legend>
            <span className="font-heading text-xs text-ink/50">
              {MIN_PLAYERS}–{MAX_PLAYERS}
            </span>
          </div>
          <Stepper
            value={settings.maxPlayers}
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            ariaLabel="max players"
            fillColor="#22C55E"
            onChange={(n) => onChange("maxPlayers", n)}
          />
        </fieldset>

        <fieldset>
          <div className="mb-2 flex items-baseline justify-between">
            <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Round timer
            </legend>
            <span className="font-heading text-xs text-ink/50">
              {MIN_TIMER}–{MAX_TIMER}s
            </span>
          </div>
          <Stepper
            value={settings.timer}
            min={MIN_TIMER}
            max={MAX_TIMER}
            step={TIMER_STEP}
            ariaLabel="round timer in seconds"
            fillColor="#FACC15"
            onChange={(n) => onChange("timer", n)}
          />
        </fieldset>

        <fieldset>
          <div className="mb-2 flex items-baseline justify-between">
            <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Memorize time
            </legend>
            <span className="font-heading text-xs text-ink/50">
              {MIN_MEMORIZE}–{MAX_MEMORIZE}s
            </span>
          </div>
          <Stepper
            value={settings.memorizeTime}
            min={MIN_MEMORIZE}
            max={MAX_MEMORIZE}
            step={MEMORIZE_STEP}
            ariaLabel="memorize time in seconds"
            fillColor="#38BDF8"
            onChange={(n) => onChange("memorizeTime", n)}
          />
        </fieldset>

        <fieldset>
          <div className="mb-2 flex items-baseline justify-between">
            <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Attempts / round
            </legend>
            <span className="font-heading text-xs text-ink/50">
              {MIN_ATTEMPTS}–{MAX_ATTEMPTS}
            </span>
          </div>
          <Stepper
            value={settings.attemptsPerRound}
            min={MIN_ATTEMPTS}
            max={MAX_ATTEMPTS}
            ariaLabel="attempts per round"
            fillColor="#bbf7d0"
            onChange={(n) => onChange("attemptsPerRound", n)}
          />
        </fieldset>

        <fieldset>
          <div className="mb-2 flex items-baseline justify-between">
            <legend className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
              Prompt cap
            </legend>
            <span className="font-heading text-xs text-ink/50">chars</span>
          </div>
          <div className="inline-flex rounded-2xl border-[3px] border-ink bg-cream p-1 shadow-chunky-sm">
            {PROMPT_LEN_OPTIONS.map((p) => {
              const selected = settings.promptMaxLength === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { playBubble(); onChange("promptMaxLength", p); }}
                  aria-pressed={selected}
                  className={`min-w-12 rounded-xl px-3 py-2 font-heading text-base font-bold cursor-pointer ${
                    selected
                      ? "bg-pink border-[3px] border-ink"
                      : "border-[3px] border-transparent text-ink/60 hover:text-ink"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* Difficulty */}
      <fieldset className="mt-6">
        <legend className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
          Difficulty
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTIES.map((d) => {
            const selected = settings.difficulty === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => { playBubble(); onChange("difficulty", d.id); }}
                aria-pressed={selected}
                className={`press rounded-2xl border-[3px] border-ink p-3 text-left transition cursor-pointer ${
                  selected ? "shadow-chunky-sm" : "bg-white opacity-70 hover:opacity-100"
                }`}
                style={selected ? { backgroundColor: d.color } : undefined}
              >
                <div className="flex items-center justify-between">
                  <div className="font-heading text-base font-bold uppercase tracking-wide">
                    {d.label}
                  </div>
                  {selected && (
                    <span className="rounded-full border-2 border-ink bg-white px-1.5 py-0 font-heading text-[9px] font-bold uppercase tracking-wide">
                      ✓
                    </span>
                  )}
                </div>
                <p className="mt-1 font-sans text-xs leading-snug text-ink/70">
                  {d.desc}
                </p>
              </button>
            );
          })}
        </div>
      </fieldset>
    </Wrapper>
  );
}
