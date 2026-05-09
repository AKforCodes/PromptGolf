import { describe, it, expect, vi, beforeEach } from "vitest"
import type { RoomSettings, Player } from "../types"

const mockGet = vi.fn()
const mockSet = vi.fn()

vi.mock("../redis", () => ({
  redis: { get: mockGet, set: mockSet },
}))

const mockSettings: RoomSettings = {
  gameMode: "showdown",
  rounds: 3,
  maxPlayers: 8,
  timer: 60,
  promptMaxLength: 200,
  attemptsPerRound: 3,
  category: "animals",
  difficulty: "normal",
}

const host: Player = {
  userId: "host-1",
  name: "Alice",
  avatarSeed: "seed-a",
  role: "prompter",
  ready: false,
  joinedAt: 1000,
  connected: true,
  lastSeenAt: 1000,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createRoom", () => {
  it("creates a room with host as first player and prompter role", async () => {
    const { createRoom } = await import("../rooms")

    const room = await createRoom(mockSettings, host)

    expect(room.code).toHaveLength(4)
    expect(room.hostId).toBe("host-1")
    expect(room.settings).toEqual(mockSettings)
    expect(room.players).toHaveLength(1)
    expect(room.players[0].userId).toBe("host-1")
    expect(room.players[0].role).toBe("prompter")
    expect(room.status).toBe("lobby")
    expect(room.currentRound).toBe(0)
    expect(room.targetId).toBeNull()
    expect(room.seed).toBeNull()
    expect(room.createdAt).toBeGreaterThan(0)
    expect(mockSet).toHaveBeenCalledOnce()
  })

  it("generates unique codes for each room", async () => {
    const { createRoom } = await import("../rooms")

    const room1 = await createRoom(mockSettings, host)
    const room2 = await createRoom(mockSettings, host)

    expect(room1.code).not.toBe(room2.code)
  })

  it("code uses only allowed characters (no 0/O/1/I)", async () => {
    const { createRoom } = await import("../rooms")

    const room = await createRoom(mockSettings, host)

    expect(room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/)
  })
})

describe("getRoom", () => {
  it("returns null for non-existent room", async () => {
    const { getRoom } = await import("../rooms")
    mockGet.mockResolvedValue(null)

    const result = await getRoom("NONEXIST")
    expect(result).toBeNull()
  })

  it("returns room state when found", async () => {
    const { createRoom, getRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    mockGet.mockResolvedValue(room)

    const result = await getRoom(room.code)
    expect(result).toEqual(room)
  })
})

describe("joinRoom", () => {
  it("assigns prompter role when under maxPlayers", async () => {
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const player2: Player = {
      userId: "user-2",
      name: "Bob",
      avatarSeed: "seed-b",
      role: "spectator",
      ready: false,
      joinedAt: 2000,
      connected: true,
      lastSeenAt: 2000,
    }

    const { room: updated, role } = await joinRoom(room, player2)

    expect(role).toBe("prompter")
    expect(updated.players).toHaveLength(2)
    expect(updated.players[1].role).toBe("prompter")
  })

  it("assigns spectator role when at maxPlayers", async () => {
    const tightSettings: RoomSettings = { ...mockSettings, maxPlayers: 1 }
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(tightSettings, host)

    const player2: Player = {
      userId: "user-2",
      name: "Bob",
      avatarSeed: "seed-b",
      role: "spectator",
      ready: false,
      joinedAt: 2000,
      connected: true,
      lastSeenAt: 2000,
    }

    const { room: updated, role } = await joinRoom(room, player2)

    expect(role).toBe("spectator")
    expect(updated.players[1].role).toBe("spectator")
  })

  it("does not duplicate existing players", async () => {
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const { room: updated } = await joinRoom(room, host)

    expect(updated.players).toHaveLength(1)
  })

  it("returns correct role for re-joining player", async () => {
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const { role } = await joinRoom(room, host)

    expect(role).toBe("prompter")
  })
})

describe("leaveRoom", () => {
  it("removes the player from the room", async () => {
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const player2: Player = {
      userId: "user-2",
      name: "Bob",
      avatarSeed: "seed-b",
      role: "spectator",
      ready: false,
      joinedAt: 2000,
      connected: true,
      lastSeenAt: 2000,
    }
    const { room: withBob } = await joinRoom(room, player2)
    const updated = await leaveRoom(withBob, "user-2")

    expect(updated.players).toHaveLength(1)
    expect(updated.players[0].userId).toBe("host-1")
  })

  it("promotes next player to host when host leaves", async () => {
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const player2: Player = {
      userId: "user-2",
      name: "Bob",
      avatarSeed: "seed-b",
      role: "spectator",
      ready: false,
      joinedAt: 2000,
      connected: true,
      lastSeenAt: 2000,
    }
    const { room: withBob } = await joinRoom(room, player2)
    const updated = await leaveRoom(withBob, "host-1")

    expect(updated.hostId).toBe("user-2")
  })

  it("does not crash when last player leaves", async () => {
    const { createRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const updated = await leaveRoom(room, "host-1")

    expect(updated.players).toHaveLength(0)
    expect(updated.hostId).toBe("host-1")
  })
})

describe("isUserInRoom", () => {
  it("returns true for a player in the room", async () => {
    const { createRoom, isUserInRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    expect(await isUserInRoom(room, "host-1")).toBe(true)
  })

  it("returns false for a player not in the room", async () => {
    const { createRoom, isUserInRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    expect(await isUserInRoom(room, "stranger")).toBe(false)
  })
})
