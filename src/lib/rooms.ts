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

  // Force the host into the prompter role regardless of what the caller
  // supplied — a spectator-host can't ready up, can't be voted on, and
  // can't be promoted by `assignRole` later. Sanitise at the boundary.
  const sanitisedHost: Player = { ...host, role: "prompter" }

  const room: RoomState = {
    code,
    hostId: sanitisedHost.userId,
    settings,
    players: [sanitisedHost],
    status: "lobby",
    currentRound: 0,
    targetId: null,
    seed: null,
    targetImageUrl: null,
    targetPrompt: null,
    scores: {},
    picks: {},
    phaseEndsAt: null,
    tiebreakerPlayers: null,
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

  // Auto-promote the earliest-joined spectator if a prompter slot is free.
  // Fixes: (a) waiting spectators not promoted when a prompter leaves,
  // (b) queue-jumping by late joiners, (c) sticky spectator role.
  const prompterCount = room.players.filter((p) => p.role === "prompter").length
  if (prompterCount < room.settings.maxPlayers) {
    const candidate = room.players
      .filter((p) => p.role === "spectator")
      .sort((a, b) => a.joinedAt - b.joinedAt)[0]
    if (candidate) {
      candidate.role = "prompter"
    }
  }

  await saveRoom(room)
  return room
}

export async function isUserInRoom(room: RoomState, userId: string): Promise<boolean> {
  return room.players.some((p) => p.userId === userId)
}

export async function setPlayerReady(
  room: RoomState,
  userId: string,
  ready: boolean
): Promise<{ room: RoomState; player: Player | null }> {
  const player = room.players.find((p) => p.userId === userId)
  if (!player) {
    return { room, player: null }
  }

  player.ready = ready
  await saveRoom(room)
  return { room, player }
}
