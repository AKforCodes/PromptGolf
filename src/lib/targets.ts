import categoriesData from "@/data/categories.json"
import type { RoomSettings } from "./types"

type CategoryEntry = {
  label: string
  emoji: string
  prompts: string[]
  // JSON parses fixed-length arrays as plain number[] — destructure at use site.
  seedRange: number[]
}

const categories = categoriesData as Record<string, CategoryEntry>

export type CategoryId = RoomSettings["category"]

export function getCategoryPrompt(category: CategoryId): { prompt: string; seed: number } {
  const entry = categories[category]
  if (!entry) {
    throw new Error(`unknown category: ${category}`)
  }
  if (!entry.prompts.length) {
    throw new Error(`category ${category} has no prompts — has src/data/categories.json been generated?`)
  }
  const prompt = entry.prompts[Math.floor(Math.random() * entry.prompts.length)]
  const [min, max] = entry.seedRange
  const seed = Math.floor(Math.random() * (max - min + 1)) + min
  return { prompt, seed }
}

export function getCategoryMeta(category: CategoryId): { label: string; emoji: string } {
  const entry = categories[category]
  if (!entry) {
    throw new Error(`unknown category: ${category}`)
  }
  return { label: entry.label, emoji: entry.emoji }
}
