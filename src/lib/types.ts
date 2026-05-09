import { z } from "zod"

export const RoomSettings = z.object({
  gameMode: z.enum(["showdown"]).default("showdown"),
  rounds: z.number().int().min(1).max(5).default(3),
  maxPlayers: z.number().int().min(1).max(8).default(8),
  timer: z.number().int().min(30).max(120).default(60),
  promptMaxLength: z.number().int().min(50).max(200).default(200),
  category: z.enum(["animals", "landmarks", "food", "celebrity", "logos"]).default("animals"),
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

export const RoomStatus = z.enum(["lobby", "countdown", "playing", "reveal", "ended"])
export type RoomStatus = z.infer<typeof RoomStatus>

export const RoomState = z.object({
  code: z.string(),
  hostId: z.string(),
  settings: RoomSettings,
  players: z.array(Player),
  status: RoomStatus,
  currentRound: z.number(),
  targetId: z.string().nullable(),
  seed: z.number().nullable(),
  createdAt: z.number(),
})

export type RoomState = z.infer<typeof RoomState>

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
