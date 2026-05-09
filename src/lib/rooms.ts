import { customAlphabet } from "nanoid"
import { redis } from "./redis"
import type { RoomSettings, Player, RoomState } from "./types"

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const ROOM_TTL = 3600

const generateCode = customAlphabet(ALPHABET, 4)

function roomKey(code: string): string {
  return `room:${code}`
}

function assignRole(
  players: Player[],
  settings: RoomSettings
): "prompter" | "spectator" {
  const prompterCount = players.filter((p) => p.role === "prompter").length
  return prompterCount < settings.maxPlayers ? "prompter" : "spectator"
}

export async function createRoom(
  settings: RoomSettings,
  host: Player
): Promise<RoomState> {
  const code = generateCode()

  const room: RoomState = {
    code,
    hostId: host.userId,
    settings,
    players: [host],
    status: "lobby",
    currentRound: 0,
    targetId: null,
    seed: null,
    targetImageUrl: null,
    targetPrompt: null,
    targetEmbedding: null,
    scores: {},
    picks: {},
    phaseEndsAt: null,
    createdAt: Date.now(),
  }

  await redis.set(roomKey(code), room, { ex: ROOM_TTL })
  return room
}

export async function getRoom(code: string): Promise<RoomState | null> {
  const data = await redis.get(roomKey(code))
  if (!data) return null
  return data as RoomState
}

export async function saveRoom(room: RoomState): Promise<void> {
  await redis.set(roomKey(room.code), room, { ex: ROOM_TTL })
}

export async function joinRoom(
  room: RoomState,
  player: Player
): Promise<{ room: RoomState; role: "prompter" | "spectator" }> {
  const existing = room.players.find((p) => p.userId === player.userId)
  if (existing) {
    return { room, role: existing.role }
  }

  const role = assignRole(room.players, room.settings)
  player.role = role

  room.players.push(player)
  await saveRoom(room)
  return { room, role }
}

export async function leaveRoom(
  room: RoomState,
  userId: string
): Promise<RoomState> {
  room.players = room.players.filter((p) => p.userId !== userId)

  if (room.hostId === userId && room.players.length > 0) {
    room.hostId = room.players[0].userId
  }

  await saveRoom(room)
  return room
}

export async function isUserInRoom(room: RoomState, userId: string): Promise<boolean> {
  return room.players.some((p) => p.userId === userId)
}
