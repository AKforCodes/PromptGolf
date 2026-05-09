import { z } from "zod"

export const RoomSettings = z.object({
  gameMode: z.enum(["showdown"]).default("showdown"),
  rounds: z.number().int().min(1).max(5).default(3),
  maxPlayers: z.number().int().min(1).max(8).default(8),
  timer: z.number().int().min(30).max(120).default(60),
  promptMaxLength: z.number().int().min(50).max(200).default(200),
  // Each player gets up to N FLUX submissions per round. Capped at 5 to bound cost.
  attemptsPerRound: z.number().int().min(1).max(5).default(3),
  category: z.enum(["animals", "landmarks", "foods", "nature", "characters"]).default("animals"),
  difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
})

export type RoomSettings = z.infer<typeof RoomSettings>

export const Player = z.object({
  userId: z.string(),
  name: z.string(),
  avatarSeed: z.string(),
  role: z.enum(["prompter", "spectator"]),
  ready: z.boolean(),
  joinedAt: z.number(),
  connected: z.boolean(),
  lastSeenAt: z.number(),
})

export type Player = z.infer<typeof Player>

export const RoomStatus = z.enum([
  "lobby",
  "generating",
  "countdown",
  "playing",
  "voting",
  "reveal",
  "ended",
])
export type RoomStatus = z.infer<typeof RoomStatus>

export const VoteValue = z.enum(["bad", "ok", "good", "excellent"])
export type VoteValue = z.infer<typeof VoteValue>

export const Vote = z.object({
  voterId: z.string(),
  targetId: z.string(),
  value: VoteValue,
  submittedAt: z.number(),
})

export type Vote = z.infer<typeof Vote>

export const RoomState = z.object({
  code: z.string(),
  hostId: z.string(),
  settings: RoomSettings,
  players: z.array(Player),
  status: RoomStatus,
  currentRound: z.number(),
  targetId: z.string().nullable(),
  seed: z.number().nullable(),
  // Round-active fields. Populated during status === "generating"|"countdown"|"playing"|"reveal", null otherwise.
  // targetEmbedding is the 768d CLIP vector cached at round-start so per-submission scoring is one CLIP call + a JS cosine.
  // targetPrompt is server-only — never broadcast over Pusher until the reveal payload.
  targetImageUrl: z.string().nullable().default(null),
  targetPrompt: z.string().nullable().default(null),
  targetEmbedding: z.array(z.number()).nullable().default(null),
  // Cumulative score per player across rounds: CLIP points (60 × best similarity) + vote points.
  // DNFs contribute 0 CLIP but can still receive vote points.
  scores: z.record(z.string(), z.number()).default({}),
  // Player picks for the current round: userId → attemptId. The picked attempt
  // is the player's "final submission" — it's what gets scored for CLIP and
  // shown to voters. Cleared on each new round. If a player doesn't pick by
  // playing → voting transition, the server falls back to their best attempt.
  picks: z.record(z.string(), z.string()).default({}),
  // Server-stamped deadline for the current phase (epoch ms). Clients render
  // a countdown to this value and auto-fire `advance` when it elapses.
  // Null in `lobby` and `ended`; null transiently while `generating`.
  phaseEndsAt: z.number().nullable().default(null),
  createdAt: z.number(),
})

export type RoomState = z.infer<typeof RoomState>

export const Attempt = z.object({
  id: z.string(),
  userId: z.string(),
  prompt: z.string(),
  imageUrl: z.string(),
  similarity: z.number(),
  qualified: z.boolean(),
  chars: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  submittedAt: z.number(),
})

export type Attempt = z.infer<typeof Attempt>

export const CreateRoomInput = z.object({
  name: z.string().min(1).max(30),
  avatarSeed: z.string(),
  settings: RoomSettings,
})

export type CreateRoomInput = z.infer<typeof CreateRoomInput>

export const JoinRoomInput = z.object({
  name: z.string().min(1).max(30),
  avatarSeed: z.string(),
})

export type JoinRoomInput = z.infer<typeof JoinRoomInput>
