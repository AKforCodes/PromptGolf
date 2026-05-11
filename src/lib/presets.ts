import type { RoomSettings } from "@/lib/types";

export interface GamePreset {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  bg: string;
  // Partial RoomSettings — only the keys this preset overrides.
  settings: Partial<RoomSettings>;
}

// Presets are gameplay flavors. Click → bulk-apply to current settings.
// Designed so each one feels meaningfully different in a demo.
export const GAME_PRESETS: ReadonlyArray<GamePreset> = [
  {
    id: "normal",
    label: "Normal",
    emoji: "⛳",
    desc: "balanced default",
    bg: "bg-golf",
    settings: {
      rounds: 3,
      timer: 60,
      memorizeTime: 20,
      attemptsPerRound: 3,
      promptMaxLength: 200,
    },
  },
  {
    id: "speedrun",
    label: "Speedrun",
    emoji: "⚡",
    desc: "30s · 1 shot",
    bg: "bg-pink",
    settings: {
      rounds: 3,
      timer: 30,
      memorizeTime: 10,
      attemptsPerRound: 1,
      promptMaxLength: 100,
    },
  },
  {
    id: "marathon",
    label: "Marathon",
    emoji: "🏆",
    desc: "5 rounds · long",
    bg: "bg-sky",
    settings: {
      rounds: 5,
      timer: 120,
      memorizeTime: 30,
      attemptsPerRound: 5,
      promptMaxLength: 200,
    },
  },
  {
    id: "haiku",
    label: "Haiku",
    emoji: "✏️",
    desc: "50 chars max",
    bg: "bg-sun",
    settings: {
      rounds: 3,
      timer: 60,
      memorizeTime: 20,
      attemptsPerRound: 3,
      promptMaxLength: 50,
    },
  },
  {
    id: "chill",
    label: "Chill",
    emoji: "🌿",
    desc: "120s · 5 shots",
    bg: "bg-[#bbf7d0]",
    settings: {
      rounds: 3,
      timer: 120,
      memorizeTime: 30,
      attemptsPerRound: 5,
      promptMaxLength: 200,
    },
  },
  {
    id: "duel",
    label: "Duel",
    emoji: "🎯",
    desc: "1 round · sudden",
    bg: "bg-[#A855F7]",
    settings: {
      rounds: 1,
      timer: 60,
      memorizeTime: 15,
      attemptsPerRound: 3,
      promptMaxLength: 200,
    },
  },
];

// Returns the preset id that currently matches every key in `settings`,
// or null if it's a custom mix.
export function detectActivePreset(settings: RoomSettings): string | null {
  for (const p of GAME_PRESETS) {
    const allMatch = (
      Object.entries(p.settings) as [keyof RoomSettings, unknown][]
    ).every(([k, v]) => settings[k] === v);
    if (allMatch) return p.id;
  }
  return null;
}

export function applyPreset(
  current: RoomSettings,
  presetId: string,
): RoomSettings {
  const p = GAME_PRESETS.find((x) => x.id === presetId);
  if (!p) return current;
  return { ...current, ...p.settings };
}
