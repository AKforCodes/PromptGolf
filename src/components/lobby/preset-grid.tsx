"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { RoomSettings } from "@/lib/types";
import { GAME_PRESETS, detectActivePreset } from "@/lib/presets";
import { useSoundEffect } from "@/components/sound-provider";

interface PresetGridProps {
  settings: RoomSettings;
  onApply: (presetId: string) => void;
}

export function PresetGrid({ settings, onApply }: PresetGridProps) {
  const reduce = useReducedMotion();
  const { playBubble } = useSoundEffect();
  const activeId = detectActivePreset(settings);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.04 } },
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {GAME_PRESETS.map((p) => {
        const active = p.id === activeId;
        const s = p.settings;
        return (
          <motion.button
            key={p.id}
            type="button"
            variants={{
              hidden: reduce
                ? { opacity: 1 }
                : { opacity: 0, y: 10, scale: 0.94 },
              visible: {
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { type: "spring", stiffness: 320, damping: 22 },
              },
            }}
            whileHover={reduce || active ? undefined : { y: -3 }}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            onClick={() => {
              playBubble();
              onApply(p.id);
            }}
            aria-pressed={active}
            aria-describedby={`preset-${p.id}-info`}
            className={`group press relative flex min-h-[140px] flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl border-[3px] border-ink p-5 text-center cursor-pointer transition-shadow ${
              active
                ? `${p.bg} shadow-chunky`
                : "bg-white shadow-chunky-sm hover:shadow-chunky"
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-ink bg-sun font-heading text-sm font-extrabold shadow-chunky-sm"
              >
                ✓
              </span>
            )}

            {/* Default face: emoji + label + desc. Slides up + fades on hover/focus. */}
            <span
              className="flex flex-col items-center gap-2 transition-all duration-300 ease-out group-hover:-translate-y-3 group-hover:opacity-0 group-focus-visible:-translate-y-3 group-focus-visible:opacity-0"
            >
              <span className="text-5xl leading-none" aria-hidden="true">
                {p.emoji}
              </span>
              <span className="font-heading text-lg font-extrabold uppercase tracking-tight">
                {p.label}
              </span>
              <span
                className={`font-heading text-xs font-bold uppercase tracking-wide ${
                  active ? "text-ink/75" : "text-ink/55"
                }`}
              >
                {p.desc}
              </span>
            </span>

            {/* Info panel: slides up from bottom on hover/focus. */}
            <span
              id={`preset-${p.id}-info`}
              className="absolute inset-0 flex translate-y-full flex-col items-center justify-center gap-1.5 px-3 py-4 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
            >
              <span className="font-heading text-base font-extrabold uppercase tracking-tight">
                <span aria-hidden="true" className="mr-1">{p.emoji}</span>
                {p.label}
              </span>
              <span className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-heading text-[11px] font-bold tabular-nums">
                {typeof s.rounds === "number" && (
                  <>
                    <span className="text-ink/55 uppercase tracking-wide">Rounds</span>
                    <span className="text-left">{s.rounds}</span>
                  </>
                )}
                {typeof s.timer === "number" && (
                  <>
                    <span className="text-ink/55 uppercase tracking-wide">Timer</span>
                    <span className="text-left">{s.timer}s</span>
                  </>
                )}
                {typeof s.memorizeTime === "number" && (
                  <>
                    <span className="text-ink/55 uppercase tracking-wide">Memorize</span>
                    <span className="text-left">{s.memorizeTime}s</span>
                  </>
                )}
                {typeof s.attemptsPerRound === "number" && (
                  <>
                    <span className="text-ink/55 uppercase tracking-wide">Attempts</span>
                    <span className="text-left">{s.attemptsPerRound}</span>
                  </>
                )}
                {typeof s.promptMaxLength === "number" && (
                  <>
                    <span className="text-ink/55 uppercase tracking-wide">Prompt</span>
                    <span className="text-left">{s.promptMaxLength}c</span>
                  </>
                )}
              </span>
            </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
