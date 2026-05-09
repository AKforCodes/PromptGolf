import type { RoomSettings } from "./types";

type Category = RoomSettings["category"];
type Difficulty = RoomSettings["difficulty"];

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 5;
export const MIN_TIMER = 30;
export const MAX_TIMER = 120;
export const TIMER_STEP = 10;
export const PROMPT_LEN_OPTIONS = [50, 100, 150, 200] as const;

export interface CategoryMeta {
  id: Category;
  label: string;
  emoji: string;
  color: string;
}

export interface DifficultyMeta {
  id: Difficulty;
  label: string;
  desc: string;
  color: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "animals", label: "Animals", emoji: "🦊", color: "#bbf7d0" },
  { id: "landmarks", label: "Landmarks", emoji: "🗽", color: "#38BDF8" },
  { id: "food", label: "Food", emoji: "🍕", color: "#F472B6" },
  { id: "celebrity", label: "Celebrities", emoji: "🌟", color: "#FACC15" },
  { id: "logos", label: "Logos", emoji: "🏷️", color: "#fda4af" },
];

export const DIFFICULTIES: DifficultyMeta[] = [
  { id: "easy", label: "Easy", desc: "lower bar to qualify", color: "#bbf7d0" },
  { id: "normal", label: "Normal", desc: "standard threshold", color: "#FACC15" },
  { id: "hard", label: "Hard", desc: "must match closely", color: "#F472B6" },
];

export function findCategory(id: Category): CategoryMeta | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function findDifficulty(id: Difficulty): DifficultyMeta | undefined {
  return DIFFICULTIES.find((d) => d.id === id);
}
